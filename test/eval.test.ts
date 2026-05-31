/**
 * Tests for the eval harness (ADR-0005): the labeled corpus is well-formed, and
 * the scorer computes precision/recall and separates the costly
 * missed-substantive error from noise. Pure and deterministic; no model.
 */
import { describe, it, expect } from "vitest";
import { scoreEval } from "../src/eval/score.ts";
import { CORPUS } from "../src/eval/corpus.ts";

describe("eval corpus (ADR-0005)", () => {
  it("is a non-empty, well-formed labeled corpus", () => {
    expect(CORPUS.length).toBeGreaterThan(0);
    for (const testCase of CORPUS) {
      expect(typeof testCase.a).toBe("string");
      expect(typeof testCase.b).toBe("string");
      expect(["substantive", "cosmetic"]).toContain(testCase.expected);
    }
  });

  it("shapes one-sided cases per ADR-0011 (empty side matches the type)", () => {
    for (const testCase of CORPUS) {
      if (testCase.type === "insertion") expect(testCase.a).toBe("");
      if (testCase.type === "deletion") expect(testCase.b).toBe("");
      // A modification (or untyped default) is two-sided: both sides have text.
      if (testCase.type === undefined || testCase.type === "modification") {
        expect(testCase.a.length).toBeGreaterThan(0);
        expect(testCase.b.length).toBeGreaterThan(0);
      }
    }
  });

  it("exercises both one-sided directions (ADR-0011 coverage)", () => {
    const types = new Set(CORPUS.map((c) => c.type ?? "modification"));
    expect(types).toContain("insertion");
    expect(types).toContain("deletion");
  });
});

describe("eval scoring (ADR-0005)", () => {
  it("returns an all-zero report for no cases", () => {
    const report = scoreEval([]);
    expect(report.total).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(report.precision).toBe(0);
    expect(report.recall).toBe(0);
    expect(report.f1).toBe(0);
    expect(report.meanConfidenceCorrect).toBe(0);
    expect(report.meanConfidenceIncorrect).toBe(0);
  });

  it("scores precision/recall and separates missed-substance from noise", () => {
    const report = scoreEval([
      { expected: "substantive", predicted: "substantive", confidence: 0.9 }, // TP, correct
      { expected: "substantive", predicted: "cosmetic", confidence: 0.4 }, // FN, wrong (missed)
      { expected: "cosmetic", predicted: "substantive", confidence: 0.6 }, // FP, wrong (noise)
      { expected: "cosmetic", predicted: "cosmetic", confidence: 0.8 }, // TN, correct
    ]);
    expect(report.total).toBe(4);
    expect(report.accuracy).toBe(0.5);
    expect(report.precision).toBe(0.5);
    expect(report.recall).toBe(0.5);
    expect(report.f1).toBeCloseTo(0.5);
    expect(report.missedSubstantive).toBe(1);
    expect(report.falseFlags).toBe(1);
    expect(report.meanConfidenceCorrect).toBeCloseTo((0.9 + 0.8) / 2);
    expect(report.meanConfidenceIncorrect).toBeCloseTo((0.4 + 0.6) / 2);
  });

  it("reports perfect scores when every call is correct", () => {
    const report = scoreEval([
      { expected: "substantive", predicted: "substantive", confidence: 1 },
      { expected: "cosmetic", predicted: "cosmetic", confidence: 1 },
    ]);
    expect(report.accuracy).toBe(1);
    expect(report.precision).toBe(1);
    expect(report.recall).toBe(1);
    expect(report.f1).toBe(1);
    expect(report.missedSubstantive).toBe(0);
    expect(report.falseFlags).toBe(0);
  });
});
