/**
 * Default classifier — calls the Anthropic Messages API to judge whether a
 * change is substantive or cosmetic (ADR-0004, ADR-0009).
 *
 * It uses the global `fetch` (no SDK), so the engine keeps ZERO runtime
 * dependencies; a consumer that needs a different provider or transport injects
 * its own `Classifier` instead. Determinism is steered by a pinned model, a
 * pinned prompt, and low effort — Opus 4.8 removed the `temperature` parameter,
 * so there is no `temperature: 0`. The verdict is returned through a constrained
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
        throw new Error(`Anthropic API error ${response.status}`);
      }
      return parseVerdict(await response.json());
    },
  };
}

/** Build the Messages API request body for one candidate pair. */
function buildRequest(modelId: string, pair: CandidatePair): unknown {
  return {
    model: modelId,
    max_tokens: MAX_TOKENS,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: VERDICT_SCHEMA },
    },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `A:\n${pair.a}\n\nB:\n${pair.b}` }],
  };
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
