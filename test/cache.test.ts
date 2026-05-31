/**
 * Tests for the content-addressed verdict cache (ADR-0004). A counting mock
 * classifier verifies that identical inputs are classified once; no model calls.
 */
import { describe, it, expect } from "vitest";
import { withCache, createMemoryCache, cacheKey } from "../src/cache.ts";
import type { CandidatePair, Classifier, ClassifierVerdict } from "../src/classifier.ts";

const VERDICT: ClassifierVerdict = { classification: "substantive", description: "changed", confidence: 0.9 };

function pair(a: string, b: string): CandidatePair {
  return { type: "modification", a, b, spanA: { start: 0, end: a.length }, spanB: { start: 0, end: b.length } };
}

function counting(): { classifier: Classifier; calls: () => number } {
  let n = 0;
  return {
    classifier: {
      classify: async () => {
        n += 1;
        return VERDICT;
      },
    },
    calls: () => n,
  };
}

describe("withCache (ADR-0004)", () => {
  it("classifies a pair once and serves repeats from cache", async () => {
    const { classifier, calls } = counting();
    const cached = withCache(classifier, { modelId: "m", promptVersion: "0" });
    expect(await cached.classify(pair("A", "B"))).toEqual(VERDICT);
    expect(await cached.classify(pair("A", "B"))).toEqual(VERDICT);
    expect(calls()).toBe(1);
  });

  it("treats whitespace-only differences as the same key", async () => {
    const { classifier, calls } = counting();
    const cached = withCache(classifier, { modelId: "m", promptVersion: "0" });
    await cached.classify(pair("A   one", "B  two"));
    await cached.classify(pair("A one", "B two"));
    expect(calls()).toBe(1);
  });

  it("keys on model id (no cross-model sharing)", async () => {
    const { classifier, calls } = counting();
    const cache = createMemoryCache();
    await withCache(classifier, { modelId: "m1", promptVersion: "0", cache }).classify(pair("A", "B"));
    await withCache(classifier, { modelId: "m2", promptVersion: "0", cache }).classify(pair("A", "B"));
    expect(calls()).toBe(2);
  });

  it("shares an injected cache across wrappers", async () => {
    const { classifier, calls } = counting();
    const cache = createMemoryCache();
    await withCache(classifier, { modelId: "m", promptVersion: "0", cache }).classify(pair("A", "B"));
    await withCache(classifier, { modelId: "m", promptVersion: "0", cache }).classify(pair("A", "B"));
    expect(calls()).toBe(1);
  });
});

describe("createMemoryCache (ADR-0004)", () => {
  it("round-trips verdicts", async () => {
    const cache = createMemoryCache();
    expect(await cache.get("k")).toBeUndefined();
    await cache.set("k", VERDICT);
    expect(await cache.get("k")).toEqual(VERDICT);
  });
});

describe("cacheKey (ADR-0004)", () => {
  it("is deterministic and sensitive to content, prompt, and model", () => {
    const base = cacheKey(pair("A", "B"), "m", "0");
    expect(base).toBe(cacheKey(pair("A", "B"), "m", "0"));
    expect(base).not.toBe(cacheKey(pair("A", "C"), "m", "0"));
    expect(base).not.toBe(cacheKey(pair("A", "B"), "m", "1"));
    expect(base).not.toBe(cacheKey(pair("A", "B"), "n", "0"));
  });

  it("does not collide when field boundaries shift", () => {
    expect(cacheKey(pair("A B", "C"), "m", "0")).not.toBe(cacheKey(pair("A", "B C"), "m", "0"));
  });
});
