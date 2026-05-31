# 0005. The eval harness and determinism layer are the core contribution

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

A thin wrapper around an LLM prompt gets cloned in a weekend. The durable value
of `semdiff` is not the prompt that classifies a change — it is the machinery
that makes the classification *trustworthy, reproducible, and measurable*. In a
legal or policy setting, "usually right" is not a claim you can make without
evidence, and "right today, who-knows tomorrow" is not a product.

Two distinct risks need a home:

- **Regression in quality.** A prompt tweak, a model upgrade, or a change to
  segmentation/alignment can silently make results worse. Without measurement we
  would not notice until a user did.
- **Nondeterminism.** The same inputs should yield the same diff. Anything that
  varies run-to-run undermines auditability — the whole point in this domain.

These are not afterthoughts to bolt on once the engine "works." They are the
definition of working.

## Decision

Build the **eval harness and determinism layer as first-class, day-one
components**, not as a later hardening pass.

**Eval harness**
- Maintain a versioned corpus of labeled diff cases: pairs of texts with the
  expected substantive/cosmetic verdict and, for substantive cases, the expected
  change. Cases are domain-neutral by default, with optional domain packs the
  consumer can add.
- Score the pipeline end-to-end on precision and recall for *substantive* change
  detection (the two failure modes — noise and missed substance — are measured
  separately, because they have different costs).
- Score the deterministic stages (`segment`, `align`) independently with golden
  fixtures, so a regression can be localized to a stage.
- Track confidence calibration: when the model says high confidence, it should be
  right more often than when it says low.
- The harness is runnable locally and in CI, and its metrics gate releases.

**Determinism layer**
- Content-addressed caching of classification results keyed on
  `(normalized pair, prompt version, model id)` — identical inputs never re-call
  the model (see [0004](0004-llm-classification-and-deterministic-gating.md)).
- Schema validation on every model response, with retries and a
  `needs-review` fallback rather than silent failure.
- Pinned model, prompt version, and sampling parameters, stamped into every
  result for reproducibility and audit.
  - **Release checklist:** the prompt version is the cache/reproducibility
    contract. While pre-release (no consumers, in-memory cache only) the prompt
    may change freely under `promptVersion: "0"`. Before the first published
    release, freeze or bump `DEFAULT_PROMPT_VERSION` to match the shipped prompt,
    and bump it on any prompt change thereafter — once a consumer can persist a
    verdict cache, a changed prompt under an unchanged version serves stale
    verdicts.
- Idempotent runs: re-diffing the same inputs produces the same structured
  output, byte-for-byte, when served from cache.

## Consequences

**Easier**
- Prompt and model changes become measurable: we can state precision/recall and
  defend "90–95% with human review" with numbers instead of vibes.
- Regressions are caught in CI, and localized to a stage, before they ship.
- Reproducibility and the version/confidence stamps give the downstream
  application the audit trail its legal-domain users require.

**Harder**
- We must build and *maintain* a labeled corpus, which is real, ongoing work and
  the part most teams skip. We treat it as the asset it is.
- CI runs that touch the model cost money and time; we mitigate with caching and
  by keeping the model-touching eval set small, deterministic, and deliberately
  curated rather than large and noisy.

## Alternatives considered

- **Ship the engine, add evals later.** Rejected: without measurement from the
  start there is no way to know whether "later" improvements are improvements,
  and quality silently rots. The harness is the product's spine, not a test
  folder.
- **Spot-check by eye.** Rejected: unrepeatable, unscalable, and exactly the
  unaccountable judgment the tool exists to replace.
- **Trust the model's self-reported confidence as ground truth.** Rejected:
  confidence must be *calibrated against labels*, not assumed; calibration is one
  of the metrics the harness tracks.
