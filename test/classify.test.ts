/**
 * Tests for the classify stage (ADR-0004). The provider is a mock `Classifier`,
 * so no real model calls are made. Covers the happy path, validation + retry,
 * the never-drop / never-fabricate needs-review fallback, and provider errors.
 */
import { describe, it, expect } from "vitest";
import { classify } from "../src/pipeline/classify.ts";
import type { CandidatePair, CandidateType, Classifier, ClassifierVerdict } from "../src/classifier.ts";

function pair(a: string, b: string, type: CandidateType = "modification"): CandidatePair {
  return {
    type,
    a,
    b,
    spanA: type === "insertion" ? null : { start: 0, end: a.length },
    spanB: type === "deletion" ? null : { start: 10, end: 10 + b.length },
  };
}

/** Mock classifier that yields the given behaviours per call (repeating the last). */
function classifierOf(...behaviours: Array<ClassifierVerdict | "throw" | unknown>): Classifier {
  let i = 0;
  return {
    classify: async (): Promise<ClassifierVerdict> => {
      const behaviour = behaviours[Math.min(i, behaviours.length - 1)];
      i += 1;
      if (behaviour === "throw") throw new Error("provider unavailable");
      return behaviour as ClassifierVerdict;
    },
  };
}

describe("classify (ADR-0004)", () => {
  it("returns no changes for no candidates", async () => {
    expect(await classify([], classifierOf({ classification: "cosmetic", confidence: 1 }))).toEqual([]);
  });

  it("maps a substantive verdict to a modification change, carrying spans", async () => {
    const verdict: ClassifierVerdict = { classification: "substantive", description: "threshold lowered", confidence: 0.9 };
    const changes = await classify([pair("30%", "40%")], classifierOf(verdict));
    expect(changes).toEqual([
      {
        type: "modification",
        classification: "substantive",
        spanA: { start: 0, end: 3 },
        spanB: { start: 10, end: 13 },
        description: "threshold lowered",
        confidence: 0.9,
        needsReview: false,
      },
    ]);
  });

  it("omits description when the verdict has none", async () => {
    const [change] = await classify([pair("a", "a.")], classifierOf({ classification: "cosmetic", confidence: 0.99 }));
    expect(change).not.toHaveProperty("description");
    expect(change?.classification).toBe("cosmetic");
  });

  it("flags a low-confidence verdict for review", async () => {
    const [change] = await classify([pair("x", "y")], classifierOf({ classification: "substantive", confidence: 0.2 }));
    expect(change?.needsReview).toBe(true);
  });

  it("trusts a verdict exactly at the confidence threshold (0.5 is not flagged; below is)", async () => {
    // MIN_TRUSTED_CONFIDENCE = 0.5; the gate is strict: confidence < 0.5 → needsReview.
    // Probing the boundary catches a threshold change that tests at 0.2 / 0.9 would miss.
    const [atBoundary] = await classify([pair("x", "y")], classifierOf({ classification: "substantive", confidence: 0.5 }));
    expect(atBoundary?.needsReview).toBe(false);
    const [belowBoundary] = await classify([pair("x", "y")], classifierOf({ classification: "substantive", confidence: 0.4999 }));
    expect(belowBoundary?.needsReview).toBe(true);
  });

  it("retries a malformed verdict, then accepts a valid one", async () => {
    const good: ClassifierVerdict = { classification: "cosmetic", confidence: 0.8 };
    const [change] = await classify([pair("a", "b")], classifierOf({ classification: "maybe", confidence: 2 }, good));
    expect(change?.classification).toBe("cosmetic");
    expect(change?.needsReview).toBe(false);
  });

  it("falls back to a substantive needs-review change when no verdict validates", async () => {
    const [change] = await classify([pair("a", "b")], classifierOf({ classification: "maybe", confidence: 2 }));
    expect(change).toEqual({
      type: "modification",
      classification: "substantive",
      spanA: { start: 0, end: 1 },
      spanB: { start: 10, end: 11 },
      confidence: 0,
      needsReview: true,
    });
  });

  it("rejects every malformed shape and falls back (never throws)", async () => {
    const malformed: unknown[] = [
      null,
      "not an object",
      { classification: "maybe", confidence: 0.5 },
      { classification: "substantive", confidence: "high" },
      { classification: "substantive", confidence: Number.NaN },
      { classification: "substantive", confidence: -0.1 },
      { classification: "substantive", confidence: 1.5 },
      { classification: "substantive", confidence: 0.5, description: 7 },
    ];
    for (const bad of malformed) {
      const [change] = await classify([pair("a", "b")], classifierOf(bad));
      expect(change?.needsReview).toBe(true);
      expect(change?.classification).toBe("substantive");
    }
  });

  it("degrades to needs-review on a persistent provider error", async () => {
    const [change] = await classify([pair("a", "b")], classifierOf("throw"));
    expect(change?.needsReview).toBe(true);
    expect(change?.classification).toBe("substantive");
  });

  it("recovers when the provider errors once then succeeds", async () => {
    const [change] = await classify([pair("a", "b")], classifierOf("throw", { classification: "cosmetic", confidence: 0.7 }));
    expect(change?.classification).toBe("cosmetic");
    expect(change?.needsReview).toBe(false);
  });

  it("classifies multiple candidates in order, preserving each pair's spans", async () => {
    const changes = await classify(
      [pair("a", "A"), pair("bb", "BB")],
      classifierOf({ classification: "substantive", description: "d", confidence: 1 }),
    );
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => [c.spanA?.end, c.spanB?.end])).toEqual([[1, 11], [2, 12]]);
  });

  it("carries the candidate type and nullable spans through to the change (ADR-0011)", async () => {
    const verdict = classifierOf({ classification: "substantive", confidence: 0.9 });
    const [inserted] = await classify([pair("", "added", "insertion")], verdict);
    expect(inserted?.type).toBe("insertion");
    expect(inserted?.spanA).toBeNull();
    const [deleted] = await classify([pair("removed", "", "deletion")], verdict);
    expect(deleted?.type).toBe("deletion");
    expect(deleted?.spanB).toBeNull();
  });

  it("classifies concurrently, bounded by the pool size (ADR-0013)", async () => {
    let inFlight = 0;
    let peak = 0;
    const classifier: Classifier = {
      classify: async (): Promise<ClassifierVerdict> => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { classification: "cosmetic", confidence: 1 };
      },
    };
    const candidates = Array.from({ length: 12 }, (_, n) => pair(`a${n}`, `b${n}`));
    const changes = await classify(candidates, classifier, 4);
    expect(changes).toHaveLength(12);
    expect(peak).toBeGreaterThan(1); // genuinely overlapped, not sequential
    expect(peak).toBeLessThanOrEqual(4); // never exceeds the pool size
  });

  it("preserves input order even when later pairs resolve first (ADR-0013)", async () => {
    // The first pair resolves slowest; output order must still follow input order.
    const classifier: Classifier = {
      classify: async (p: CandidatePair): Promise<ClassifierVerdict> => {
        await new Promise((resolve) => setTimeout(resolve, p.a === "first" ? 20 : 1));
        return { classification: "substantive", description: p.a, confidence: 1 };
      },
    };
    const changes = await classify(
      [pair("first", "x"), pair("second", "y"), pair("third", "z")],
      classifier,
      8,
    );
    expect(changes.map((c) => c.description)).toEqual(["first", "second", "third"]);
  });

  it("treats a non-positive concurrency as sequential (pool of 1)", async () => {
    let inFlight = 0;
    let peak = 0;
    const classifier: Classifier = {
      classify: async (): Promise<ClassifierVerdict> => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return { classification: "cosmetic", confidence: 1 };
      },
    };
    const changes = await classify([pair("a", "A"), pair("b", "B")], classifier, 0);
    expect(changes).toHaveLength(2);
    expect(peak).toBe(1);
  });
});
