/**
 * semdiff — meaning-aware diff engine (library entry point).
 *
 * The library is the source of truth (ADR-0002); the CLI is a thin wrapper.
 * `diff` runs the segment -> align -> classify pipeline (ADR-0003) and returns
 * the versioned `StructuredDiff` (ADR-0006), the engine's public contract.
 */
export * from "./schema.ts";
export * from "./classifier.ts";
export { ENGINE_VERSION, DEFAULT_PROMPT_VERSION } from "./version.ts";

import type { StructuredDiff } from "./schema.ts";
import type { Classifier } from "./classifier.ts";
import type { SegmentGranularity } from "./pipeline/segment.ts";

/** Options for a `diff` run. Omit a field to take its default. */
export interface DiffOptions {
  /**
   * Provider used to classify changed pairs. Defaults to the latest capable
   * Claude model via `createDefaultClassifier` (ADR-0004).
   */
  readonly classifier?: Classifier;
  /** Override the default classifier's model id. */
  readonly modelId?: string;
  /** Pin the prompt-template version stamped into provenance. */
  readonly promptVersion?: string;
  /** Granularity at which inputs are segmented (ADR-0003). */
  readonly segmentGranularity?: SegmentGranularity;
}

/**
 * Produce a meaning-aware structured diff of two inputs. Runs
 * segment -> align -> classify, stamps run provenance, and returns the
 * `StructuredDiff`. Skeleton: not yet implemented.
 */
export async function diff(a: string, b: string, options?: DiffOptions): Promise<StructuredDiff> {
  void a;
  void b;
  void options;
  throw new Error("not implemented: diff");
}
