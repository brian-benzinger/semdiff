/**
 * The semdiff public contract (ADR-0006).
 *
 * A `StructuredDiff` is the engine's primary output. Every human-readable
 * rendering is a pure function of it, and machine consumers — notably the
 * downstream `sust-reg-reporter` application — integrate against these types
 * and their JSON form. This module is pure types and constants: no logic, no
 * imports, nothing domain-specific (ADR-0001).
 */

/**
 * Version of the StructuredDiff contract. Additive-by-default (ADR-0006): a
 * backwards-compatible addition keeps the version; a breaking shape change
 * bumps it and gets its own ADR. `StructuredDiff.schemaVersion` is typed as a
 * plain `string` (not this literal) so an additive bump is not itself a
 * breaking type change for pinned consumers.
 */
export const SCHEMA_VERSION = "1.0.0";

/**
 * A `Span` locates a change within ONE input by half-open `[start, end)`
 * CHARACTER OFFSETS (ADR-0007).
 *
 * INVARIANT (load-bearing for consumer citation integrity): offsets index into
 * the EXACT, LITERAL, UN-NORMALIZED input string the caller passed. For
 * `sust-reg-reporter` that string is the immutable content-addressed snapshot
 * text (its ADR-0004 citation integrity, ADR-0011 snapshot store), so the
 * offsets resolve against a stored snapshot. Normalization applied internally
 * for alignment (whitespace, casing, punctuation, numbering) MUST NOT shift the
 * reported offsets. These `{ start, end }` map field-for-field onto the
 * consumer's citation span (`@sust-reg/core` `SourceCitation.span`).
 */
export interface Span {
  /** Inclusive start character offset into the literal input. */
  readonly start: number;
  /** Exclusive end character offset into the literal input. */
  readonly end: number;
  /**
   * Optional id of the segmentation unit this span falls in (ADR-0003).
   * Additive metadata only — consumers anchor on `start`/`end`, never this.
   */
  readonly unitId?: string;
}

/** The kind of edit a change represents. */
export type ChangeType = "insertion" | "deletion" | "modification" | "move";

/** Whether a change alters meaning (`substantive`) or not (`cosmetic`). */
export type Classification = "substantive" | "cosmetic";

/** One classified change between input A and input B. */
export interface Change {
  readonly type: ChangeType;
  readonly classification: Classification;
  /** Location in input A; `null` for a pure insertion (absent from A). */
  readonly spanA: Span | null;
  /** Location in input B; `null` for a pure deletion (absent from B). */
  readonly spanB: Span | null;
  /**
   * Short description of what changed. Present only for substantive
   * modifications; the key is OMITTED otherwise (never set to `undefined`,
   * per `exactOptionalPropertyTypes`).
   */
  readonly description?: string;
  /** Classifier confidence in `[0, 1]`. */
  readonly confidence: number;
  /** Set for low-confidence or failed/degraded classifications (ADR-0004). */
  readonly needsReview: boolean;
}

/** The reproducibility stamp for a run (ADR-0004): identifies the model run. */
export interface Provenance {
  readonly modelId: string;
  readonly promptVersion: string;
  readonly engineVersion: string;
}

/** Aggregate counts for quick triage. */
export interface DiffSummary {
  readonly substantive: number;
  readonly cosmetic: number;
  /** Count per change type; all four keys are present (zeros allowed). */
  readonly byType: Readonly<Record<ChangeType, number>>;
  readonly needsReview: number;
}

/**
 * The engine's primary output (ADR-0006): a stable, versioned, JSON-
 * serializable diff. All human-readable views derive from it.
 */
export interface StructuredDiff {
  /** The `SCHEMA_VERSION` in effect at emit time; typed `string` for additive bumps. */
  readonly schemaVersion: string;
  readonly provenance: Provenance;
  readonly changes: readonly Change[];
  readonly summary: DiffSummary;
}
