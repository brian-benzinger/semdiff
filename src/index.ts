/**
 * semdiff — meaning-aware diff engine (library entry point).
 *
 * The library is the source of truth (ADR-0002); the CLI is a thin wrapper.
 * `diff` runs the segment -> align -> classify pipeline (ADR-0003) and assembles
 * the versioned `StructuredDiff` (ADR-0006), the engine's public contract.
 */
export * from "./schema.ts";
export * from "./classifier.ts";

import { SCHEMA_VERSION, type Change, type DiffSummary, type Provenance, type StructuredDiff } from "./schema.ts";
import { DEFAULT_MODEL_ID, type CandidatePair, type Classifier } from "./classifier.ts";
import { createDefaultClassifier } from "./classifiers/claude.ts";
import { ENGINE_VERSION, DEFAULT_PROMPT_VERSION } from "./version.ts";
import { segment, type SegmentGranularity, type Unit } from "./pipeline/segment.ts";
import { align } from "./pipeline/align.ts";
import { classify } from "./pipeline/classify.ts";

export { ENGINE_VERSION, DEFAULT_PROMPT_VERSION };
export { createDefaultClassifier, type DefaultClassifierConfig } from "./classifiers/claude.ts";
export { withCache, createMemoryCache, cacheKey, type VerdictCache, type CacheOptions } from "./cache.ts";
export { DEFAULT_CONCURRENCY } from "./pipeline/classify.ts";

/** Options for a `diff` run. Omit a field to take its default. */
export interface DiffOptions {
  /**
   * Provider used to classify changed pairs. Defaults to the latest capable
   * Claude model via `createDefaultClassifier` (ADR-0004) — which is only
   * constructed when there is a change to classify (a modification, insertion,
   * or deletion). Identical, cosmetic, and moved content needs no provider.
   */
  readonly classifier?: Classifier;
  /** Model id stamped into provenance; also passed to the default classifier. */
  readonly modelId?: string;
  /** Prompt-template version stamped into provenance. */
  readonly promptVersion?: string;
  /** Granularity at which inputs are segmented (ADR-0003). */
  readonly segmentGranularity?: SegmentGranularity;
  /**
   * How many changed pairs to classify concurrently (ADR-0013). Defaults to
   * `DEFAULT_CONCURRENCY`. Raise it to diff faster when the provider's rate limit
   * allows; lower it (or set 1 for fully sequential) on a tight rate limit.
   */
  readonly classifyConcurrency?: number;
}

/**
 * Produce a meaning-aware structured diff of two inputs. Runs
 * segment -> align -> classify, stamps run provenance, and assembles the
 * `StructuredDiff`. A classifier is constructed and called only when there is at
 * least one change to classify (a modification, insertion, or deletion), so
 * diffs of identical, cosmetic, or merely relocated content need no provider.
 */
export async function diff(a: string, b: string, options?: DiffOptions): Promise<StructuredDiff> {
  const granularity = options?.segmentGranularity ?? "sentence";
  const pairs = align(segment(a, granularity), segment(b, granularity));

  const candidates: CandidatePair[] = [];
  for (const pair of pairs) {
    if (pair.tag !== "candidate") continue;
    if (pair.a !== null && pair.b !== null) {
      candidates.push({ type: "modification", a: pair.a.text, b: pair.b.text, spanA: pair.a.span, spanB: pair.b.span });
    } else if (pair.b !== null) {
      candidates.push({ type: "insertion", a: "", b: pair.b.text, spanA: null, spanB: pair.b.span });
    } else {
      candidates.push({ type: "deletion", a: pair.a!.text, b: "", spanA: pair.a!.span, spanB: null });
    }
  }

  const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
  const classified =
    candidates.length === 0
      ? []
      : await classify(
          candidates,
          options?.classifier ?? createDefaultClassifier({ modelId }),
          options?.classifyConcurrency,
        );

  const changes: Change[] = [];
  let classifiedIndex = 0;
  for (const pair of pairs) {
    if (pair.tag === "unchanged") continue;
    if (pair.tag === "trivial-change") {
      changes.push(cosmeticModification(pair.a!, pair.b!));
    } else if (pair.tag === "move") {
      changes.push(moveChange(pair.a!, pair.b!));
    } else {
      changes.push(classified[classifiedIndex]!);
      classifiedIndex += 1;
    }
  }

  const provenance: Provenance = {
    modelId,
    promptVersion: options?.promptVersion ?? DEFAULT_PROMPT_VERSION,
    engineVersion: ENGINE_VERSION,
  };
  return { schemaVersion: SCHEMA_VERSION, provenance, changes, summary: summarize(changes) };
}

/** A cosmetic edit to a matched unit — determined deterministically, no model. */
function cosmeticModification(a: Unit, b: Unit): Change {
  return { type: "modification", classification: "cosmetic", spanA: a.span, spanB: b.span, confidence: 1, needsReview: false };
}

/**
 * A relocation of identical content (ADR-0010) — deterministic and cosmetic: the
 * text did not change, only its position, so it is surfaced as a `move` rather
 * than a delete + insert. `a` is the old span, `b` the new one.
 */
function moveChange(a: Unit, b: Unit): Change {
  return { type: "move", classification: "cosmetic", spanA: a.span, spanB: b.span, confidence: 1, needsReview: false };
}

function summarize(changes: readonly Change[]): DiffSummary {
  const byType = { insertion: 0, deletion: 0, modification: 0, move: 0 };
  let substantive = 0;
  let cosmetic = 0;
  let needsReview = 0;
  for (const change of changes) {
    byType[change.type] += 1;
    if (change.classification === "substantive") substantive += 1;
    else cosmetic += 1;
    if (change.needsReview) needsReview += 1;
  }
  return { substantive, cosmetic, byType, needsReview };
}
