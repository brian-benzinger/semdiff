/**
 * Content-addressed verdict cache (ADR-0004). Identical classification inputs
 * return the cached verdict without a second model call — the primary
 * determinism and cost guarantee.
 *
 * The key is a hash of the normalized pair text plus the prompt version and
 * model id, so the same change under the same model/prompt is classified once.
 * Spans are deliberately NOT part of the key: the verdict (substantive/cosmetic
 * + description + confidence) describes the content change, not where it sits,
 * so a pair classified once applies wherever that text appears.
 *
 * The default cache is in-memory and process-local; inject a `VerdictCache` to
 * back it with a persistent store — the engine keeps no backend of its own
 * (ADR-0001). Reuse the wrapped classifier across `diff` calls to share it.
 */
import { createHash } from "node:crypto";
import type { CandidatePair, Classifier, ClassifierVerdict } from "./classifier.ts";

/**
 * Field separator for the cache key. Normalization collapses whitespace and
 * never emits a NUL byte, so distinct field boundaries can never collide.
 */
const FIELD_SEPARATOR = String.fromCharCode(0);

/** A store for classification verdicts, keyed by content hash. May be async. */
export interface VerdictCache {
  get(key: string): Promise<ClassifierVerdict | undefined>;
  set(key: string, verdict: ClassifierVerdict): Promise<void>;
}

/** An in-memory `VerdictCache` (process-local; the default). */
export function createMemoryCache(): VerdictCache {
  const store = new Map<string, ClassifierVerdict>();
  return {
    get: (key) => Promise.resolve(store.get(key)),
    set: (key, verdict) => {
      store.set(key, verdict);
      return Promise.resolve();
    },
  };
}

/** Options for `withCache`. `modelId` and `promptVersion` are part of the key. */
export interface CacheOptions {
  readonly modelId: string;
  readonly promptVersion: string;
  readonly cache?: VerdictCache;
}

/**
 * Wrap a `Classifier` so identical inputs are classified once. Reuse the
 * returned classifier across `diff` calls to share the cache.
 */
export function withCache(classifier: Classifier, options: CacheOptions): Classifier {
  const cache = options.cache ?? createMemoryCache();
  return {
    classify: async (pair: CandidatePair): Promise<ClassifierVerdict> => {
      const key = cacheKey(pair, options.modelId, options.promptVersion);
      const cached = await cache.get(key);
      if (cached !== undefined) return cached;
      const verdict = await classifier.classify(pair);
      await cache.set(key, verdict);
      return verdict;
    },
  };
}

/** Content-addressed key: a hash of (normalized a, normalized b, prompt, model). */
export function cacheKey(pair: CandidatePair, modelId: string, promptVersion: string): string {
  const parts = [normalize(pair.a), normalize(pair.b), promptVersion, modelId];
  return createHash("sha256").update(parts.join(FIELD_SEPARATOR)).digest("hex");
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
