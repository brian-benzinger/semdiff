# 0013. Concurrent classification with a bounded pool

- **Status:** Accepted
- **Date:** 2026-06-06

## Context

The pipeline ([0003](0003-meaning-aware-diff-pipeline.md)) classifies each
changed candidate pair with one provider call ([0004](0004-llm-classification-and-deterministic-gating.md),
[0011](0011-classify-one-sided-changes.md)). The `classify` stage ran these
**sequentially** — `await` in a `for` loop — so wall time was
`#changes × per-call latency`. With the default Opus classifier at ~1.5–2s per
call, a real document diff is dominated by this: ~58 changes took ~130s, and a
larger amendment scaled linearly into minutes. The segmentation and (Hirschberg,
[align](../src/pipeline/align.ts)) alignment stages are local and fast by
comparison; classification is ~95% of the wall time.

The calls are **independent**: each verdict depends only on its own pair, the
pinned prompt, and the pinned model — never on another pair's result. So
sequencing them buys nothing but latency.

## Decision

`classify` runs up to `DEFAULT_CONCURRENCY` (8) classifications at once through a
bounded worker pool, configurable per run via `DiffOptions.classifyConcurrency`.

- **Bounded, not per-pair-unbounded.** A fixed pool of N workers each pull the
  next pending pair; a 10,000-change diff still issues at most N calls at a time,
  never 10,000 simultaneous requests.
- **Order preserved.** Each result is written at its input index, so a pair that
  finishes first never reorders the diff. The structured output ([0006](0006-structured-diff-output-schema.md))
  is identical to the sequential result.
- **Per-pair semantics unchanged.** The validate → retry → `needs-review`
  fallback ([0004](0004-llm-classification-and-deterministic-gating.md)) and the
  provider's transport resilience ([0012](0012-classifier-resilience-timeout-and-retry.md))
  are untouched; concurrency only overlaps independent calls.
- **Default sized to the provider, not the machine.** 8 is small enough that the
  default classifier's 429/5xx backoff ([0012](0012-classifier-resilience-timeout-and-retry.md))
  absorbs rate limits rather than amplifying them; a caller on a tighter limit
  sets `classifyConcurrency: 1` (fully sequential) or higher on a generous one.

## Consequences

**Easier**
- Wall time drops by ~the pool size: an ~58-change diff goes from ~130s toward
  ~20s. Diffs that were minutes become tens of seconds.
- A downstream caller can tune throughput to its provider tier without a new
  release, via `classifyConcurrency`.

**Harder**
- More calls are in flight at once, so a low provider rate limit is reached
  sooner. This is contained, not eliminated: the pool is bounded and the
  provider's backoff ([0012](0012-classifier-resilience-timeout-and-retry.md))
  handles the 429s; the lever to back off further is `classifyConcurrency`.
- Verdict *timing* is now interleaved, but classification *output* is unchanged
  (independent calls, index-ordered results), so the determinism guarantee
  ([0004](0004-llm-classification-and-deterministic-gating.md)) — about verdicts,
  not wall-clock — still holds. No eval re-run is required: the same pairs get
  the same prompt and model.

## Alternatives considered

- **Keep it sequential.** Rejected: simplest, but leaves the engine minutes-slow
  on real documents — the stated problem.
- **Unbounded `Promise.all` over all pairs.** Rejected: a large change set would
  fan out into hundreds-to-thousands of simultaneous requests, guaranteeing rate
  limits and risking provider-side throttling or bans. The pool must be bounded.
- **Batch many pairs into one provider call.** Rejected here: it would change the
  prompt and the one-call-per-pair contract ([0004](0004-llm-classification-and-deterministic-gating.md),
  [0011](0011-classify-one-sided-changes.md)), forcing a prompt-version bump and
  an eval re-run, and it complicates per-pair validation. A worthwhile future
  optimization, but a larger decision than this latency fix.
