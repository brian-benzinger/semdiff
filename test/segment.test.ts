/**
 * Golden-fixture tests for the segment stage (ADR-0003). Deterministic; no
 * model. Expected outputs were verified against the pinned ICU segmenter.
 *
 * The central assertion is the offset invariant (ADR-0007): for every unit,
 * `input.slice(span.start, span.end) === unit.text`, proving spans index the
 * literal, un-normalized input.
 */
import { describe, it, expect } from "vitest";
import { segment, type Unit } from "../src/pipeline/segment.ts";

function assertOffsetsIndexLiteralInput(input: string, units: readonly Unit[]): void {
  for (const unit of units) {
    expect(input.slice(unit.span.start, unit.span.end)).toBe(unit.text);
    expect(unit.span.end).toBeGreaterThanOrEqual(unit.span.start);
  }
}

describe("segment (ADR-0003)", () => {
  it("returns no units for empty or whitespace-only input", () => {
    expect(segment("", "sentence")).toEqual([]);
    expect(segment("   \n\t ", "sentence")).toEqual([]);
    expect(segment("   ", "clause")).toEqual([]);
  });

  it("splits text into sentences", () => {
    const input = "The cap is large. A new exemption applies.";
    const units = segment(input, "sentence");
    expect(units.map((u) => u.text)).toEqual([
      "The cap is large.",
      "A new exemption applies.",
    ]);
    assertOffsetsIndexLiteralInput(input, units);
  });

  it("treats an unterminated sentence as a single unit", () => {
    const input = "no terminal punctuation here";
    const units = segment(input, "sentence");
    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe(input);
    expect(units[0]?.span).toEqual({ start: 0, end: input.length });
  });

  it("excludes boundary whitespace from the span", () => {
    const input = "   Leading and trailing spaces.   ";
    const units = segment(input, "sentence");
    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe("Leading and trailing spaces.");
    expect(units[0]?.span).toEqual({ start: 3, end: 31 });
    assertOffsetsIndexLiteralInput(input, units);
  });

  it("splits clauses on semicolons and colons within a sentence", () => {
    const input = "First clause; second clause: third clause.";
    const units = segment(input, "clause");
    expect(units.map((u) => u.text)).toEqual([
      "First clause",
      "second clause",
      "third clause.",
    ]);
    assertOffsetsIndexLiteralInput(input, units);
  });

  it("does not split below the sentence under sentence granularity", () => {
    const input = "First clause; second clause.";
    expect(segment(input, "sentence").map((u) => u.text)).toEqual([
      "First clause; second clause.",
    ]);
  });

  it("skips empty clauses from adjacent or trailing delimiters", () => {
    const input = "A;; B:";
    const units = segment(input, "clause");
    expect(units.map((u) => u.text)).toEqual(["A", "B"]);
    assertOffsetsIndexLiteralInput(input, units);
  });

  it("segments clauses across sentence boundaries", () => {
    const input = "Alpha; beta. Gamma: delta.";
    const units = segment(input, "clause");
    expect(units.map((u) => u.text)).toEqual(["Alpha", "beta.", "Gamma", "delta."]);
    assertOffsetsIndexLiteralInput(input, units);
  });
});
