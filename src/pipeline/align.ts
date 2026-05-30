/**
 * Stage 2 — align (ADR-0003). Local and deterministic; no LLM.
 *
 * Match units across A and B: exact, then normalized near-match (whitespace,
 * casing, punctuation, numbering collapsed), then a similarity measure to pair
 * survivors and detect insertions, deletions, and moves. Each pairing is
 * tagged. The stage 2 -> 3 boundary is the cost/determinism gate: only
 * `candidate` pairings reach the classifier (ADR-0004).
 *
 * Normalization here is for MATCHING ONLY; it must never alter the offsets the
 * units carry from `segment` (the offset invariant, ADR-0007). Covered by
 * golden-fixture tests (ADR-0005).
 */
import type { Unit } from "./segment.ts";

/** How an aligned pairing relates its A and B units. */
export type AlignmentTag = "unchanged" | "trivial-change" | "candidate";

/** A pairing of units across inputs; either side may be `null`. */
export interface AlignedPair {
  readonly tag: AlignmentTag;
  /** Unit from A, or `null` for an insertion. */
  readonly a: Unit | null;
  /** Unit from B, or `null` for a deletion. */
  readonly b: Unit | null;
}

/**
 * Align the segmented units of A and B into tagged pairings. Deterministic.
 * Skeleton: not yet implemented.
 */
export function align(unitsA: readonly Unit[], unitsB: readonly Unit[]): readonly AlignedPair[] {
  void unitsA;
  void unitsB;
  throw new Error("not implemented: align");
}
