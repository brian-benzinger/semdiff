/**
 * Default classifier — calls the Anthropic Messages API to judge whether a
 * change is substantive or cosmetic (ADR-0004, ADR-0009).
 *
 * It uses the global `fetch` (no SDK), so the engine keeps ZERO runtime
 * dependencies; a consumer that needs a different provider or transport injects
 * its own `Classifier` instead. Determinism is steered by a pinned model, a
 * pinned prompt, and low effort where the model accepts it — Opus 4.8 removed the
 * `temperature` parameter, so there is no `temperature: 0`. The verdict is returned through a constrained
 * JSON schema and then RE-VALIDATED by the classify stage, so this module can
 * parse leniently: any malformed response surfaces as a thrown error that the
 * classify stage retries, then degrades to needs-review.
 */
import { DEFAULT_MODEL_ID, type CandidatePair, type Classifier, type ClassifierVerdict } from "../classifier.ts";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;

/**
 * Static classification instructions — the stable, cacheable prompt prefix
 * (ADR-0009). Domain-neutral (ADR-0001). Recall-biased per ADR-0005: when
 * uncertain, prefer "substantive" so a real change is surfaced, not hidden.
 */
const SYSTEM_PROMPT = [
  "You are a careful classifier inside a meaning-aware diff engine. You are given",
  "two versions of one short span of prose: version A (before) and version B",
  "(after). Decide whether the change from A to B is:",
  "",
  '- "substantive": it alters the meaning — a changed value, number, date,',
  "  condition, scope, or any wording a careful reader would act on differently.",
  '- "cosmetic": it preserves the meaning — formatting, punctuation, casing,',
  "  whitespace, renumbering, or a meaning-preserving rewording.",
  "",
  "One side may be empty: an empty A means the B text was newly inserted, and an",
  "empty B means the A text was removed. Judge whether that insertion or removal",
  "is substantive (it adds or removes meaning, an obligation, or a condition) or",
  "cosmetic (boilerplate, formatting, or duplicate content).",
  "",
  "Rules:",
  "- Judge only these two snippets; do not assume external context.",
  '- When genuinely uncertain whether the meaning changed, choose "substantive":',
  "  it is safer to surface a real change than to hide one.",
  '- For a substantive change, give a one-sentence factual "description" of what',
  "  changed — no advice and no judgement of how significant it is.",
  '- Set "confidence" in [0, 1] for how sure you are of the classification.',
].join("\n");

/** Constrained output shape (structured outputs). Ranges are validated downstream. */
const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    classification: { type: "string", enum: ["substantive", "cosmetic"] },
    description: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["classification", "confidence"],
  additionalProperties: false,
} as const;

/** Configuration for the default Anthropic-backed classifier. */
export interface DefaultClassifierConfig {
  /** Model id; defaults to the latest capable Claude (ADR-0004). */
  readonly modelId?: string;
  /** API key; defaults to `process.env.ANTHROPIC_API_KEY`. */
  readonly apiKey?: string;
}

/**
 * Construct the default classifier. Throws immediately if no API key is
 * available, so a diff that needs the model fails at a clear boundary rather
 * than per-call.
 */
export function createDefaultClassifier(config: DefaultClassifierConfig): Classifier {
  const modelId = config.modelId ?? DEFAULT_MODEL_ID;
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    throw new Error("createDefaultClassifier: no API key (set ANTHROPIC_API_KEY or pass config.apiKey)");
  }

  return {
    classify: async (pair: CandidatePair): Promise<ClassifierVerdict> => {
      const response = await fetch(MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(buildRequest(modelId, pair)),
      });
      if (!response.ok) {
        throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
      }
      return parseVerdict(await response.json());
    },
  };
}

/** Build the Messages API request body for one candidate pair. */
function buildRequest(modelId: string, pair: CandidatePair): unknown {
  const outputConfig: Record<string, unknown> = {
    format: { type: "json_schema", schema: VERDICT_SCHEMA },
  };
  // `effort` steers determinism and cost, but only Opus and Sonnet 4.6 accept
  // it; Haiku and Sonnet 4.5 reject it with a 400. Include it only where
  // supported so overriding `modelId` to a cheaper model (an eval sweep, say)
  // does not fail. Omitting it is harmless; sending it where unsupported is not.
  if (modelSupportsEffort(modelId)) {
    outputConfig.effort = "low";
  }
  return {
    model: modelId,
    max_tokens: MAX_TOKENS,
    output_config: outputConfig,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Change type: ${pair.type}.\nA:\n${pair.a}\n\nB:\n${pair.b}` }],
  };
}

/**
 * Whether `output_config.effort` is accepted by `modelId`. Opus (4.5+) and
 * Sonnet 4.6 support it; Haiku and Sonnet 4.5 return a 400. Biased to omit when
 * unsure — a missing effort still succeeds, an unsupported effort does not — so
 * a future model silently runs without effort rather than erroring.
 */
function modelSupportsEffort(modelId: string): boolean {
  return modelId.startsWith("claude-opus-") || modelId.startsWith("claude-sonnet-4-6");
}

/** Extract the structured verdict from the Messages API response (lenient). */
function parseVerdict(data: unknown): ClassifierVerdict {
  const message = data as { content?: ReadonlyArray<{ type?: string; text?: string }> };
  const text = message.content?.find((block) => block.type === "text")?.text;
  if (text === undefined) {
    throw new Error("Anthropic API returned no text content");
  }
  return JSON.parse(text) as ClassifierVerdict;
}
