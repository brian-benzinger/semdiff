/**
 * The classification boundary (ADR-0004).
 *
 * semdiff uses the LLM strictly as a gated, structured classifier behind a
 * small `Classifier` interface — never a free-form diff narrator, never a
 * hardwired SDK. The default provider is the latest capable Claude model,
 * injected via config, so consumers (e.g. `sust-reg-reporter`) are not forced
 * to own provider wiring.
 */
import type { Classification, Span } from "./schema.ts";

/** A single changed pair handed to the classifier for a verdict. */
export interface CandidatePair {
  /** The unit text from input A. */
  readonly a: string;
  /** The unit text from input B. */
  readonly b: string;
  /** Location of `a` within input A (literal character offsets, ADR-0007). */
  readonly spanA: Span;
  /** Location of `b` within input B (literal character offsets, ADR-0007). */
  readonly spanB: Span;
}

/** The schema-validated verdict for one candidate pair. */
export interface ClassifierVerdict {
  readonly classification: Classification;
  /** Present only for a substantive verdict; OMITTED otherwise. */
  readonly description?: string;
  /** Provider/engine confidence in `[0, 1]`. */
  readonly confidence: number;
}

/** The injectable provider boundary. An implementation wraps one LLM provider. */
export interface Classifier {
  classify(pair: CandidatePair): Promise<ClassifierVerdict>;
}

/**
 * Default model id (the latest capable Claude, ADR-0004). Stamped into run
 * provenance, and used by the default classifier when the caller does not pin
 * one. Callers that inject their own provider should pass `modelId` for an
 * accurate provenance stamp.
 */
export const DEFAULT_MODEL_ID = "claude-opus-4-8";

/**
 * The never-drop / never-fabricate fallback verdict (ADR-0004). When a model
 * response fails schema validation, retries are exhausted, or the provider
 * errors, the `classify` stage records this conservative verdict — `substantive`
 * (so the change is surfaced for review, not hidden) with zero confidence — and
 * flags the resulting change for review, rather than dropping the pair or
 * guessing a cosmetic/substantive call.
 */
export function needsReviewVerdict(): ClassifierVerdict {
  return { classification: "substantive", confidence: 0 };
}
