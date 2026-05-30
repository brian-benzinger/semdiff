# 0009. The default classifier calls the Anthropic API over fetch

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

[0004](0004-llm-classification-and-deterministic-gating.md) makes the LLM
provider injectable behind a `Classifier` interface, with the default being "the
latest capable Claude model." Through the skeleton and the three pipeline
stages, `createDefaultClassifier` stayed a stub: the engine ran end-to-end only
when the caller injected a classifier. To let the engine actually classify — to
test it against a real model without the consumer wiring a provider — the
default needs a real implementation.

The hard constraint is the package's **zero runtime dependencies**
([0002](0002-typescript-node-library-and-cli.md)). Adding `@anthropic-ai/sdk`
would break that for every consumer, including those who inject their own
provider and would never load it. The consuming application
(`sust-reg-reporter`) also calls the LLM as a service **external to AWS** (its
ADR-0007 / ADR-0010), so no AWS/Bedrock client is implied.

## Decision

Implement `createDefaultClassifier` in `src/classifiers/claude.ts`, calling the
Anthropic **Messages API** (`POST /v1/messages`) with the runtime's **global
`fetch`** — no SDK, so the zero-dependency posture is preserved.

- **Model** is pinned to `DEFAULT_MODEL_ID` (`claude-opus-4-8`), overridable via
  config.
- **Structured output**: the request constrains the response to a JSON schema
  (`output_config.format`) of `{ classification, description?, confidence }`, so
  the verdict is parseable without prompt-shape guessing.
- **Determinism** is steered by the pinned model, a pinned/cacheable system
  prompt, and **low effort** — Opus 4.8 removed the `temperature` parameter, so
  there is deliberately no `temperature: 0`.
- **Prompt caching**: a `cache_control` breakpoint sits on the static system
  prompt (the stable prefix across all calls).
- **Lenient parse, strict validate**: this module parses best-effort and throws
  on anything malformed; the classify stage ([0004]) re-validates every verdict,
  retries, then degrades to needs-review — so a bad response never crashes a diff.
- The API key comes from config or `ANTHROPIC_API_KEY`; constructing the default
  with no key throws at that clear boundary.
- The system prompt is **domain-neutral** ([0001]) and **recall-biased** ([0005]):
  when uncertain, classify "substantive" so a real change is surfaced, not hidden.

## Consequences

**Easier**
- `diff(a, b)` now works against a real model with only an API key; the consumer
  need not own provider wiring, and can still inject its own `Classifier`.
- Still zero runtime dependencies; the same artifact runs locally and on Lambda.
- The Messages call is naturally gated: only `candidate` pairs reach it ([0003]),
  on top of the consumer's own content-hash gate.

**Harder**
- The request shape (`output_config.format`, `effort`) follows current Anthropic
  guidance and should be confirmed on the first live run; if the API rejects it,
  every classify degrades to needs-review rather than failing the diff.
- Prompt caching only takes effect once the static prefix exceeds the model's
  minimum cacheable size (~4096 tokens for Opus 4.8); the current concise
  instruction set is below that, so caching is correctly wired but inert until
  the prompt grows. Recorded rather than padded.
- Content-addressed caching of verdicts ([0004]) is still unimplemented and
  belongs around this provider; out of scope here.

## Alternatives considered

- **`@anthropic-ai/sdk`.** Rejected: adds a runtime dependency for all consumers
  and breaks the zero-dep posture ([0002]). `fetch` covers the one endpoint used.
- **Amazon Bedrock / an AWS client.** Rejected: the consumer's LLM is external to
  AWS (its ADR-0007 / ADR-0010); baking in AWS would couple the neutral engine to
  one deployment.
- **Prompt-instructed JSON without structured outputs.** Rejected as the default:
  schema-constrained output is more reliably parseable; the classify stage's
  validation remains the safety net either way.
