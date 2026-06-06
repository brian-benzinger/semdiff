/**
 * Stage 3 — classify (ADR-0003, ADR-0004). The gated, structured LLM step.
 *
 * The caller passes only genuine `candidate` pairs — align has already kept
 * unchanged, trivial-change, and move content away from the model. A candidate
 * may be a modification (both sides present) or a one-sided insertion/deletion
 * (ADR-0011); for each, this stage asks the injected `Classifier` for a verdict,
 * validates it against the schema, retries once on a malformed response or a
 * provider error, and finally degrades to a flagged `needs-review` change —
 * never dropping a pair and never fabricating a verdict (ADR-0004). The provider
 * stays injected; this module imports no SDK, so the engine has no LLM-infra
 * dependency.
 *
 * Caching (ADR-0004's content-addressed cache) belongs with the provider
 * implementation, not this stage, and is out of scope here.
 */
import type { Change } from "../schema.ts";
import { needsReviewVerdict, type CandidatePair, type Classifier, type ClassifierVerdict } from "../classifier.ts";

/** Attempts per pair: one initial call plus one retry (ADR-0004). */
const MAX_ATTEMPTS = 2;

/** Verdicts below this confidence are flagged for review (ADR-0006). */
const MIN_TRUSTED_CONFIDENCE = 0.5;

/**
 * How many pairs are classified at once by default (ADR-0013). semdiff makes one
 * provider call per changed pair (ADR-0004, ADR-0011); classifying them one after
 * another makes wall time (#changes × per-call latency) — minutes on a real
 * document. A bounded worker pool keeps several calls in flight, cutting wall time
 * by ~the pool size, while staying small enough that the default classifier's
 * 429/5xx backoff (ADR-0012) absorbs provider rate limits instead of amplifying
 * them. The pool size is bounded, never per-pair-unbounded, so a huge change set
 * cannot fan out into thousands of simultaneous requests.
 */
export const DEFAULT_CONCURRENCY = 8;

/**
 * Classify changed candidate pairs into `Change`s using the injected classifier,
 * running up to `concurrency` classifications concurrently (ADR-0013). Output
 * ORDER is preserved — each result is placed at its input index, so a pair that
 * finishes first never reorders the diff — and every change carries the
 * candidate's type and spans untouched. Per-pair validation, retry, and the
 * needs-review fallback are unchanged: concurrency only overlaps independent calls.
 */
export async function classify(
  candidates: readonly CandidatePair[],
  classifier: Classifier,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<readonly Change[]> {
  const changes = new Array<Change>(candidates.length);
  const poolSize = Math.min(
    Math.max(1, Math.floor(concurrency)),
    Math.max(1, candidates.length),
  );
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < candidates.length; i = next++) {
      changes[i] = await classifyPair(candidates[i]!, classifier);
    }
  };
  await Promise.all(Array.from({ length: poolSize }, worker));
  return changes;
}

async function classifyPair(pair: CandidatePair, classifier: Classifier): Promise<Change> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let verdict: unknown;
    try {
      verdict = await classifier.classify(pair);
    } catch {
      continue; // provider error / timeout / rate limit — retry, then needs-review
    }
    if (isValidVerdict(verdict)) {
      return toChange(pair, verdict);
    }
  }
  return needsReviewChange(pair);
}

/** Runtime guard: the model response is untrusted until validated (ADR-0004). */
function isValidVerdict(value: unknown): value is ClassifierVerdict {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.classification !== "substantive" && v.classification !== "cosmetic") return false;
  if (typeof v.confidence !== "number" || !Number.isFinite(v.confidence)) return false;
  if (v.confidence < 0 || v.confidence > 1) return false;
  if (v.description !== undefined && typeof v.description !== "string") return false;
  return true;
}

function toChange(pair: CandidatePair, verdict: ClassifierVerdict): Change {
  const base = {
    type: pair.type,
    classification: verdict.classification,
    spanA: pair.spanA,
    spanB: pair.spanB,
    confidence: verdict.confidence,
    needsReview: verdict.confidence < MIN_TRUSTED_CONFIDENCE,
  };
  return verdict.description === undefined ? base : { ...base, description: verdict.description };
}

function needsReviewChange(pair: CandidatePair): Change {
  const { classification, confidence } = needsReviewVerdict();
  return {
    type: pair.type,
    classification,
    spanA: pair.spanA,
    spanB: pair.spanB,
    confidence,
    needsReview: true,
  };
}
