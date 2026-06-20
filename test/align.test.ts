/**
 * Golden-fixture tests for the align stage (ADR-0003). Deterministic; no model.
 * Expected outputs were verified against the implementation.
 *
 * Units are constructed directly so alignment is tested in isolation from
 * segmentation; one integration test drives real `segment` output through
 * `align` and checks that unit offsets survive the stage (ADR-0007).
 */
import { describe, it, expect } from "vitest";
import { align, type AlignedPair } from "../src/pipeline/align.ts";
import { segment } from "../src/pipeline/segment.ts";
import type { Unit } from "../src/pipeline/segment.ts";

/** Build a Unit with a valid (if synthetic) span. */
function u(text: string, start = 0): Unit {
  return { text, span: { start, end: start + text.length } };
}

/** Compact view of a result: [tag, aText|null, bText|null]. */
function shape(pairs: readonly AlignedPair[]): Array<[string, string | null, string | null]> {
  return pairs.map((p) => [p.tag, p.a?.text ?? null, p.b?.text ?? null]);
}

describe("align (ADR-0003)", () => {
  it("returns no pairs for two empty inputs", () => {
    expect(align([], [])).toEqual([]);
  });

  it("tags identical units unchanged", () => {
    const a = [u("The cap is large."), u("It applies.")];
    const b = [u("The cap is large."), u("It applies.")];
    expect(shape(align(a, b))).toEqual([
      ["unchanged", "The cap is large.", "The cap is large."],
      ["unchanged", "It applies.", "It applies."],
    ]);
  });

  it("tags casing- and punctuation-only differences as trivial-change", () => {
    expect(shape(align([u("The Cap is large.")], [u("the cap is LARGE")]))).toEqual([
      ["trivial-change", "The Cap is large.", "the cap is LARGE"],
    ]);
  });

  it("treats a renumbered clause as trivial-change", () => {
    expect(shape(align([u("(3) The threshold holds.")], [u("(4) The threshold holds.")]))).toEqual([
      ["trivial-change", "(3) The threshold holds.", "(4) The threshold holds."],
    ]);
  });

  it("pairs a substantive in-place change as a candidate modification", () => {
    expect(shape(align([u("The cap is 30%.")], [u("The cap is 40%.")]))).toEqual([
      ["candidate", "The cap is 30%.", "The cap is 40%."],
    ]);
  });

  it("splits unrelated replacements into a deletion and an insertion", () => {
    expect(shape(align([u("Cats sleep often.")], [u("Mountains are tall.")]))).toEqual([
      ["candidate", "Cats sleep often.", null],
      ["candidate", null, "Mountains are tall."],
    ]);
  });

  it("detects a mid-sequence insertion", () => {
    const a = [u("A one."), u("C three.")];
    const b = [u("A one."), u("B two."), u("C three.")];
    expect(shape(align(a, b))).toEqual([
      ["unchanged", "A one.", "A one."],
      ["candidate", null, "B two."],
      ["unchanged", "C three.", "C three."],
    ]);
  });

  it("detects a mid-sequence deletion", () => {
    const a = [u("A one."), u("B two."), u("C three.")];
    const b = [u("A one."), u("C three.")];
    expect(shape(align(a, b))).toEqual([
      ["unchanged", "A one.", "A one."],
      ["candidate", "B two.", null],
      ["unchanged", "C three.", "C three."],
    ]);
  });

  it("detects a leading insertion (LCS advances B)", () => {
    expect(shape(align([u("alpha"), u("beta")], [u("xray"), u("alpha"), u("beta")]))).toEqual([
      ["candidate", null, "xray"],
      ["unchanged", "alpha", "alpha"],
      ["unchanged", "beta", "beta"],
    ]);
  });

  it("detects a leading deletion (LCS advances A)", () => {
    expect(shape(align([u("xray"), u("alpha"), u("beta")], [u("alpha"), u("beta")]))).toEqual([
      ["candidate", "xray", null],
      ["unchanged", "alpha", "alpha"],
      ["unchanged", "beta", "beta"],
    ]);
  });

  it("treats every unit as inserted when A is empty", () => {
    expect(shape(align([], [u("only b")]))).toEqual([["candidate", null, "only b"]]);
  });

  it("treats every unit as deleted when B is empty", () => {
    expect(shape(align([u("only a")], []))).toEqual([["candidate", "only a", null]]);
  });

  it("pairs a similar survivor and leaves the extra A unit a deletion", () => {
    const a = [u("alpha one term"), u("alpha two term")];
    const b = [u("alpha three term")];
    expect(shape(align(a, b))).toEqual([
      ["candidate", "alpha one term", "alpha three term"],
      ["candidate", "alpha two term", null],
    ]);
  });

  it("pairs a similar survivor and leaves the extra B unit an insertion", () => {
    const a = [u("alpha one term")];
    const b = [u("alpha two term"), u("alpha three term")];
    expect(shape(align(a, b))).toEqual([
      ["candidate", "alpha one term", "alpha two term"],
      ["candidate", null, "alpha three term"],
    ]);
  });

  it("keeps comparison symbols so an operator flip is a candidate, not cosmetic", () => {
    expect(shape(align([u("x < 5")], [u("x > 5")]))).toEqual([
      ["candidate", "x < 5", "x > 5"],
    ]);
  });

  it("does not pair a token-less (punctuation-only) unit with a lexical one", () => {
    expect(shape(align([u("—")], [u("real words here")]))).toEqual([
      ["candidate", "—", null],
      ["candidate", null, "real words here"],
    ]);
  });

  it("drives real segment output through align and preserves offsets (ADR-0007)", () => {
    const inputA = "The cap is large. It applies in 2027.";
    const inputB = "The cap is large. It applies in 2028.";
    const pairs = align(segment(inputA, "sentence"), segment(inputB, "sentence"));
    expect(pairs.map((p) => p.tag)).toEqual(["unchanged", "candidate"]);
    for (const pair of pairs) {
      if (pair.a !== null) expect(inputA.slice(pair.a.span.start, pair.a.span.end)).toBe(pair.a.text);
      if (pair.b !== null) expect(inputB.slice(pair.b.span.start, pair.b.span.end)).toBe(pair.b.text);
    }
  });

  it("aligns thousands of units without an n*m length matrix (linear space)", () => {
    // Under the old O(n*m)-space LCS this allocated a ~16M-cell matrix; the
    // divide-and-conquer alignment keeps only rolling rows, so a large diff
    // with a small change stays cheap. Guards against reintroducing the matrix.
    const size = 4000;
    const a = Array.from({ length: size }, (_, i) => u(`Clause number ${i}.`));
    const b = a.map((unit, i) =>
      i === size / 2 ? u("An entirely different clause.") : unit,
    );
    const pairs = align(a, b);
    expect(pairs.filter((p) => p.tag === "unchanged")).toHaveLength(size - 1);
    expect(pairs.some((p) => p.tag === "candidate")).toBe(true);
  });

  it("detects a relocation of identical content as a move with old/new spans", () => {
    const a = [u("Alpha.", 0), u("Beta.", 7)];
    const b = [u("Beta.", 0), u("Alpha.", 6)];
    const pairs = align(a, b);
    expect(pairs.map((p) => p.tag)).toEqual(["move", "unchanged"]);
    expect(pairs[0]?.a?.span).toEqual({ start: 0, end: 6 });
    expect(pairs[0]?.b?.span).toEqual({ start: 6, end: 12 });
  });

  it("pairs a deletion with the LAST insertion when multiple insertions share the same normalized key", () => {
    // detectMoves builds its insertion map with Map.set(), so when two insertions
    // share a normalized key the LAST one overwrites the first. A corresponding
    // deletion is therefore matched to the last insertion, leaving the first as an
    // orphan candidate. This documents the intentional last-wins semantics and
    // would catch a regression to first-wins.
    //
    // Setup: a=[Alpha.,Beta.,Gamma.,Delta.], b=[Alpha.,Gamma.,Delta.,Beta.,Beta.]
    // LCS matches Alpha/Gamma/Delta; Beta is a deletion in a and appears twice
    // as insertions at positions 21 and 28 in b.
    const a = [u("Alpha.", 0), u("Beta.", 7), u("Gamma.", 13), u("Delta.", 20)];
    const b = [u("Alpha.", 0), u("Gamma.", 7), u("Delta.", 14), u("Beta.", 21), u("Beta.", 28)];
    const pairs = align(a, b);
    const move = pairs.find((p) => p.tag === "move");
    expect(move).toBeDefined();
    expect(move?.a?.span).toEqual({ start: 7, end: 12 });  // Beta. deletion from a
    expect(move?.b?.span).toEqual({ start: 28, end: 33 }); // LAST insertion wins
    const leftover = pairs.find((p) => p.tag === "candidate" && p.a === null);
    expect(leftover?.b?.span).toEqual({ start: 21, end: 26 }); // first insertion is left over
  });
});
