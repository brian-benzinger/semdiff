/**
 * End-to-end tests for the diff orchestrator (ADR-0003, ADR-0006). A mock
 * Classifier is injected where a substantive modification candidate exists, so
 * no real model calls are made. Diffs without such a candidate need no provider.
 */
import { describe, it, expect } from "vitest";
import { diff } from "../src/index.ts";
import { SCHEMA_VERSION } from "../src/schema.ts";
import { ENGINE_VERSION, DEFAULT_PROMPT_VERSION } from "../src/version.ts";
import { DEFAULT_MODEL_ID, type Classifier } from "../src/classifier.ts";

const substantive: Classifier = {
  classify: async () => ({ classification: "substantive", description: "rate changed", confidence: 0.95 }),
};

describe("diff (ADR-0003, ADR-0006)", () => {
  it("returns an empty, well-formed diff for identical inputs (no classifier needed)", async () => {
    const result = await diff("One sentence here. Another one.", "One sentence here. Another one.");
    expect(result.changes).toEqual([]);
    expect(result.summary).toEqual({
      substantive: 0,
      cosmetic: 0,
      byType: { insertion: 0, deletion: 0, modification: 0, move: 0 },
      needsReview: 0,
    });
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.provenance).toEqual({
      modelId: DEFAULT_MODEL_ID,
      promptVersion: DEFAULT_PROMPT_VERSION,
      engineVersion: ENGINE_VERSION,
    });
  });

  it("records a cosmetic edit without calling a classifier", async () => {
    const result = await diff("The Cap Is Large.", "the cap is large");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.type).toBe("modification");
    expect(result.changes[0]?.classification).toBe("cosmetic");
    expect(result.summary.cosmetic).toBe(1);
  });

  it("classifies an insertion via the injected classifier", async () => {
    const b = "First one. Second one. Third one.";
    const result = await diff("First one. Third one.", b, { classifier: substantive });
    expect(result.changes).toHaveLength(1);
    const change = result.changes[0]!;
    expect(change.type).toBe("insertion");
    expect(change.classification).toBe("substantive");
    expect(change.spanA).toBeNull();
    // The B-side span must be present and extract the inserted sentence verbatim.
    expect(change.spanB).not.toBeNull();
    expect(b.slice(change.spanB!.start, change.spanB!.end)).toBe("Second one.");
    expect(change.needsReview).toBe(false);
    expect(result.summary.byType.insertion).toBe(1);
  });

  it("classifies a deletion via the injected classifier", async () => {
    const a = "First one. Second one. Third one.";
    const result = await diff(a, "First one. Third one.", { classifier: substantive });
    expect(result.changes).toHaveLength(1);
    const change = result.changes[0]!;
    expect(change.type).toBe("deletion");
    // Classification from the injected classifier must reach the assembled change.
    expect(change.classification).toBe("substantive");
    // The A-side span must be present and extract the deleted sentence verbatim.
    expect(change.spanA).not.toBeNull();
    expect(a.slice(change.spanA!.start, change.spanA!.end)).toBe("Second one.");
    expect(change.spanB).toBeNull();
    expect(change.needsReview).toBe(false);
    expect(result.summary.byType.deletion).toBe(1);
  });

  it("classifies a substantive modification via the injected classifier", async () => {
    const result = await diff("The cap is 30%.", "The cap is 40%.", { classifier: substantive });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.type).toBe("modification");
    expect(result.changes[0]?.classification).toBe("substantive");
    expect(result.changes[0]?.description).toBe("rate changed");
    expect(result.summary.substantive).toBe(1);
  });

  it("falls back to the default classifier when none is injected (no key → API-key error)", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(diff("The cap is 30%.", "The cap is 40%.")).rejects.toThrow(/no API key/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("flags a low-confidence modification for review in the summary", async () => {
    const lowConfidence: Classifier = { classify: async () => ({ classification: "substantive", confidence: 0.1 }) };
    const result = await diff("The cap is 30%.", "The cap is 40%.", { classifier: lowConfidence });
    const change = result.changes[0]!;
    // Low confidence sets needsReview but must not alter the classification or confidence value.
    expect(change.needsReview).toBe(true);
    expect(change.classification).toBe("substantive");
    expect(change.confidence).toBe(0.1);
    expect(result.summary.needsReview).toBe(1);
  });

  it("stamps provenance from options", async () => {
    const result = await diff("The cap is 30%.", "The cap is 40%.", {
      classifier: substantive,
      modelId: "m-1",
      promptVersion: "p-9",
    });
    expect(result.provenance).toEqual({ modelId: "m-1", promptVersion: "p-9", engineVersion: ENGINE_VERSION });
  });

  it("respects clause granularity — change span covers only the modified clause, not the whole sentence", async () => {
    // At sentence granularity the whole sentence is one unit; at clause
    // granularity the two clauses segment independently, so a casing-only
    // change to the second clause does not widen the span to cover the
    // unchanged first clause. This verifies that segmentGranularity is
    // actually passed through and affects the pipeline output.
    const a = "First clause; SECOND CLAUSE.";
    const b = "First clause; second clause.";

    const clauseResult = await diff(a, b, { segmentGranularity: "clause" });
    expect(clauseResult.changes).toHaveLength(1);
    expect(clauseResult.changes[0]?.classification).toBe("cosmetic");
    // "SECOND CLAUSE." begins at offset 14 — only the second clause is a change.
    expect(clauseResult.changes[0]?.spanA).toEqual({ start: 14, end: 28 });

    // At sentence granularity the entire sentence is one unit, so the span starts at 0.
    const sentenceResult = await diff(a, b, { segmentGranularity: "sentence" });
    expect(sentenceResult.changes).toHaveLength(1);
    expect(sentenceResult.changes[0]?.spanA).toEqual({ start: 0, end: 28 });
  });

  it("keeps change spans indexing the literal inputs (ADR-0007)", async () => {
    const a = "First one. The cap is 30%.";
    const b = "First one. The cap is 40%.";
    const result = await diff(a, b, { classifier: substantive });
    expect(result.changes).toHaveLength(1);
    for (const change of result.changes) {
      if (change.spanA !== null) expect(a.slice(change.spanA.start, change.spanA.end)).toBe("The cap is 30%.");
      if (change.spanB !== null) expect(b.slice(change.spanB.start, change.spanB.end)).toBe("The cap is 40%.");
    }
  });

  it("detects a relocation as a cosmetic move, needing no classifier", async () => {
    const result = await diff("Alpha one. Beta two.", "Beta two. Alpha one.");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.type).toBe("move");
    expect(result.changes[0]?.classification).toBe("cosmetic");
    expect(result.summary.byType.move).toBe(1);
  });

  it("forwards classifyConcurrency to classify — sequential at 1 never runs more than one call at a time", async () => {
    // Guards the option path in diff(): if options?.classifyConcurrency were dropped
    // from the classify() call, the default pool (DEFAULT_CONCURRENCY=8) would be
    // used and peak would equal the number of candidates (3), not 1.
    let inFlight = 0;
    let peak = 0;
    const tracking: Classifier = {
      classify: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { classification: "substantive", confidence: 0.9 };
      },
    };
    const result = await diff(
      "First sentence. Second sentence. Third sentence.",
      "First modified. Second modified. Third modified.",
      { classifier: tracking, classifyConcurrency: 1 },
    );
    expect(result.changes).toHaveLength(3);
    expect(result.changes.every((c) => c.classification === "substantive")).toBe(true);
    expect(peak).toBe(1);
  });
});
