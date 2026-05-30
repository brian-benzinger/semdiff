/**
 * Stage 1 — segment (ADR-0003). Local and deterministic; no model.
 *
 * Split an input into comparable units. At `sentence` granularity each unit is
 * a sentence; at `clause` granularity sentences are further divided at strong
 * intra-sentence separators. Each `Unit` carries the half-open `[start, end)`
 * CHARACTER OFFSETS of its text within the LITERAL input, so spans reported
 * downstream index the caller's exact input (the offset invariant, ADR-0007):
 * `input.slice(unit.span.start, unit.span.end) === unit.text` always holds.
 * Whitespace at unit boundaries is excluded from the span (and the text); no
 * other normalization is applied, so offsets never drift.
 */
import type { Span } from "../schema.ts";

/** The granularity at which an input is segmented. */
export type SegmentGranularity = "sentence" | "clause";

/** One comparable unit of an input, anchored to the literal input by offsets. */
export interface Unit {
  /** The unit's text, verbatim from the input (boundary whitespace trimmed). */
  readonly text: string;
  /** Half-open offsets of `text` within the literal input. */
  readonly span: Span;
}

/**
 * Sentence breaking is language-aware, and determinism is a core guarantee
 * (ADR-0005), so we pin the locale rather than use the ambient runtime locale.
 * Making the locale configurable is a later additive change.
 */
const SENTENCE_SEGMENTER = new Intl.Segmenter("en", { granularity: "sentence" });

/**
 * Strong intra-sentence clause separators. Comma-level splitting is deliberately
 * excluded — too unreliable to be deterministically useful — and enumerated-
 * clause structural cues are a future additive enhancement.
 */
const CLAUSE_DELIMITERS = ";:";

/**
 * Segment `text` into ordered `Unit`s at the given granularity. Deterministic;
 * no model. Empty and whitespace-only inputs yield no units.
 */
export function segment(text: string, granularity: SegmentGranularity): readonly Unit[] {
  const units: Unit[] = [];
  const delimiters = granularity === "clause" ? CLAUSE_DELIMITERS : "";
  for (const { segment: sentence, index } of SENTENCE_SEGMENTER.segment(text)) {
    emitUnits(sentence, index, delimiters, units);
  }
  return units;
}

/**
 * Emit trimmed units from a sentence `chunk` located at absolute offset `base`.
 * With no delimiters the chunk is a single unit; otherwise it is split at each
 * delimiter character, offsets staying absolute into the literal input.
 */
function emitUnits(chunk: string, base: number, delimiters: string, out: Unit[]): void {
  if (delimiters.length === 0) {
    pushTrimmed(chunk, base, out);
    return;
  }
  let cursor = 0;
  for (let i = 0; i < chunk.length; i++) {
    if (delimiters.includes(chunk[i]!)) {
      pushTrimmed(chunk.slice(cursor, i), base + cursor, out);
      cursor = i + 1;
    }
  }
  pushTrimmed(chunk.slice(cursor), base + cursor, out);
}

/**
 * Trim boundary whitespace from `part` and, if non-empty, push a `Unit` whose
 * span points at the trimmed content within the literal input (`base` is the
 * absolute offset of `part`).
 */
function pushTrimmed(part: string, base: number, out: Unit[]): void {
  const trimmed = part.trim();
  if (trimmed.length === 0) return;
  const start = base + (part.length - part.trimStart().length);
  out.push({ text: trimmed, span: { start, end: start + trimmed.length } });
}
