/**
 * Stage 1 — segment (ADR-0003). Local and deterministic; no model.
 *
 * Split an input into comparable units (sentence or clause level). Each `Unit`
 * carries the half-open `[start, end)` CHARACTER OFFSETS of its text within the
 * LITERAL input string, so spans reported downstream index the caller's exact
 * input (the offset invariant, ADR-0007). Structural cues (e.g. enumerated
 * clauses) are retained as metadata. Covered by golden-fixture tests (ADR-0005).
 */
import type { Span } from "../schema.ts";

/** The granularity at which an input is segmented. */
export type SegmentGranularity = "sentence" | "clause";

/** One comparable unit of an input, anchored to the literal input by offsets. */
export interface Unit {
  /** The unit's text, verbatim from the input. */
  readonly text: string;
  /** Half-open offsets of `text` within the literal input. */
  readonly span: Span;
}

/**
 * Segment `text` into ordered `Unit`s at the given granularity. Deterministic.
 * Skeleton: not yet implemented.
 */
export function segment(text: string, granularity: SegmentGranularity): readonly Unit[] {
  void text;
  void granularity;
  throw new Error("not implemented: segment");
}
