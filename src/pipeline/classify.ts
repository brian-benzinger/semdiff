/**
 * Stage 3 — classify (ADR-0003, ADR-0004). LLM-backed and gated.
 *
 * Only `candidate` pairings from `align` reach the classifier; `unchanged` and
 * `trivial-change` pairings never cost a model call. Each candidate is sent to
 * the injected `Classifier`; the verdict is validated, retried on failure, then
 * degraded to a flagged `needs-review` result — never dropped or fabricated.
 * Verdicts are folded into `Change` objects. Skeleton: not yet implemented.
 */
import type { Change } from "../schema.ts";
import type { CandidatePair, Classifier } from "../classifier.ts";

/**
 * Classify changed candidate pairs into `Change`s using the injected
 * classifier. Skeleton: not yet implemented.
 */
export async function classify(
  candidates: readonly CandidatePair[],
  classifier: Classifier,
): Promise<readonly Change[]> {
  void candidates;
  void classifier;
  throw new Error("not implemented: classify");
}
