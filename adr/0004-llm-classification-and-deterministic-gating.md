# 0004. LLM-backed classification with deterministic gating

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

The substantive-vs-cosmetic judgment in the `classify` stage
([0003](0003-meaning-aware-diff-pipeline.md)) requires reading two snippets and
deciding whether the *meaning* changed. That is a language-understanding task an
LLM does well and rules-based code does not.

But an LLM in a loop is a liability if used naively: it is nondeterministic,
costs real money per call (the provider is external to any AWS free tier), and is
wrong some fraction of the time. The brief is explicit that the unglamorous
engineering around the model — gating, schema validation, retries, idempotency,
caching, confidence flags, graceful failure — is the actual contribution, not the
prompt. A tool that is right 90–95% of the time *and is honest about which 5–10%
it is unsure of* beats one that is confidently wrong.

## Decision

Use an LLM strictly as a **gated, structured classifier**, never as a free-form
diff narrator. Concretely:

1. **Gate every call on actual change.** Only `candidate` pairs from the
   deterministic `align` stage reach the model. Unchanged and trivially-changed
   content never costs a call. The application layer adds an outer gate: it runs
   `semdiff` only when a source's content hash changes, so the model fires on
   real change at both levels.

2. **Constrain the output to a schema.** Every classification returns
   structured, machine-validated output (substantive/cosmetic, a change
   description, and a confidence value), validated on receipt. Output that fails
   validation is retried, then surfaced as a low-confidence/`needs-review` result
   — never silently dropped or guessed at.

3. **Pin the call for reproducibility.** Fix the model, prompt version, and
   sampling parameters (temperature 0 where the provider honors it), and record
   the model/prompt version in the result so a verdict can be reproduced and
   audited. Determinism is best-effort at the provider boundary; the system is
   designed not to *depend* on bit-identical model output (see caching below).

4. **Cache by content.** Key results on a hash of `(normalized pair, prompt
   version, model id)`. Identical inputs return the cached verdict without a
   second call — this is the strongest determinism guarantee available and the
   primary cost control on re-runs.

5. **Inject the provider behind an interface.** The engine depends on a small
   `Classifier` abstraction, not on a concrete SDK. This keeps `semdiff`
   provider-agnostic, makes the model trivially mockable in tests, and lets a
   caller supply its own client/credentials.

6. **Fail gracefully.** Provider errors, timeouts, and rate limits degrade to a
   flagged `needs-review` result for the affected pairs; they never crash the run
   or fabricate a verdict. A partial diff with honest gaps beats a fake complete
   one.

The default model is the latest capable Claude model, configurable via the
injected `Classifier`.

## Consequences

**Easier**
- Cost and nondeterminism are bounded structurally, not by hope: caching plus
  gating means re-running on unchanged or seen content is effectively free and
  fully reproducible.
- Validation + confidence flags give downstream consumers (and human reviewers) a
  defensible signal of where to look, which is exactly what a legal-domain
  consumer needs.
- Swapping or upgrading the model is a config change behind the interface, and
  the prompt-version stamp makes such changes auditable.

**Harder**
- We maintain prompt versioning, a cache, and a validation/retry path — more
  moving parts than a single prompt call. This is deliberate; it is the
  contribution.
- Confidence is a model-reported signal and must itself be calibrated and
  watched by the eval harness ([0005](0005-eval-harness-and-determinism-layer.md)),
  not trusted blindly.

## Alternatives considered

- **Free-form LLM diff narration.** Rejected: unparseable, unverifiable,
  uncacheable by structure, and impossible to gate or audit. Structured output is
  non-negotiable.
- **Hardwire one provider SDK.** Rejected: couples the engine to a vendor,
  hurts testability, and contradicts the domain-neutral, broadly-adoptable
  posture of [0001](0001-standalone-domain-neutral-engine.md).
- **Fine-tune a bespoke classifier.** Deferred: premature at this scope and data
  volume, and it would trade the determinism-by-caching story for a training and
  evaluation burden. Revisit only if eval data shows a capable general model is
  insufficient.
