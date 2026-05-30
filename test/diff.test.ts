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

  it("records an insertion as substantive", async () => {
    const result = await diff("First one. Third one.", "First one. Second one. Third one.");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.type).toBe("insertion");
    expect(result.changes[0]?.classification).toBe("substantive");
    expect(result.changes[0]?.spanA).toBeNull();
    expect(result.summary.byType.insertion).toBe(1);
  });

  it("records a deletion as substantive", async () => {
    const result = await diff("First one. Second one. Third one.", "First one. Third one.");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.type).toBe("deletion");
    expect(result.changes[0]?.spanB).toBeNull();
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

  it("uses the default classifier (which throws) when a candidate needs one and none is injected", async () => {
    await expect(diff("The cap is 30%.", "The cap is 40%.")).rejects.toThrow(/not implemented: createDefaultClassifier/);
  });

  it("flags a low-confidence modification for review in the summary", async () => {
    const lowConfidence: Classifier = { classify: async () => ({ classification: "substantive", confidence: 0.1 }) };
    const result = await diff("The cap is 30%.", "The cap is 40%.", { classifier: lowConfidence });
    expect(result.changes[0]?.needsReview).toBe(true);
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

  it("respects clause granularity", async () => {
    const result = await diff("Alpha; beta.", "Alpha; beta.", { segmentGranularity: "clause" });
    expect(result.changes).toEqual([]);
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
});
