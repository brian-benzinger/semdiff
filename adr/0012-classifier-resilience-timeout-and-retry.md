# 0012. Default classifier resilience: timeout and bounded retry

- **Status:** Accepted
- **Date:** 2026-05-31

## Context

[0009](0009-default-classifier-over-fetch.md) has the default classifier call
the Anthropic API over a single `fetch`, with zero dependencies. As first
written that call had **no timeout and no retry**: a transient rate-limit (429),
an overloaded provider (529), a 5xx, a dropped connection, or a hung socket all
surfaced as a thrown error.

[0004](0004-llm-classification-and-deterministic-gating.md) /
[0011](0011-classify-one-sided-changes.md) already give the classify *stage* a
safety net — it retries the whole `classify()` call twice on any throw and then
degrades the pair to `needs-review`, so a pair is never dropped. But that net is
the wrong tool for a transient transport blip: it is immediate (no backoff),
shallow (two attempts), and blunt — a momentary 429 that a 500 ms wait would
clear instead burns the pair to `needs-review`. It also does not bound time: a
hung connection blocks the entire diff indefinitely.

Resilience against transient transport failure is a **provider** concern. It
belongs with the `fetch` adapter, not the pipeline stage.

## Decision

The default classifier wraps each call with a timeout and a bounded, backed-off
retry of transient failures.

- **Timeout.** Each attempt is aborted after `timeoutMs` (default 60000) via an
  `AbortController`; an abort is treated as a transient failure.
- **Transient = retryable:** HTTP **429** and **5xx** (including **529**
  overloaded), network errors, and timeouts. Everything else — 400, auth, a
  malformed 200 — is non-transient and **fails fast**.
- **Backoff:** exponential `BASE * 2**n` with jitter, capped at a max; a
  `Retry-After` header (seconds) is honoured when present.
- **Bounded:** `maxRetries` (default 2) after the initial attempt; on exhaustion
  the last error is thrown.
- **Configurable** via `timeoutMs` and `maxRetries` on `DefaultClassifierConfig`;
  `maxRetries: 0` restores single-shot behaviour.

This is the **provider's** resilience and sits *below* the stage's verdict-level
retry/`needs-review` ([0004](0004-llm-classification-and-deterministic-gating.md)),
which is unchanged. The provider exhausts its backoff first; only a call that
still throws reaches the stage's safety net.

## Consequences

**Easier**
- A momentary 429/529/5xx or connection blip no longer burns a pair to
  `needs-review`; the call waits and succeeds. Result quality holds up under
  load, and `Retry-After` keeps the engine a well-behaved API citizen.
- A hung connection can no longer stall a whole diff — every call is
  time-bounded.
- Still **zero runtime dependencies**: `AbortController`, `fetch`, and timers are
  Node built-ins (holds the [0009](0009-default-classifier-over-fetch.md) line).

**Harder**
- Worst-case latency rises: under sustained failure a pair can take up to roughly
  `timeout + Σ backoff` before degrading. It is bounded by `maxRetries` and the
  timeout, and tunable to `0`.
- Two retry layers now exist — transport here, semantic in the stage. They solve
  different problems (a transient *transport* failure vs an untrusted or
  again-failing *verdict*) and are documented so they are not conflated or
  collapsed into one.
- Backoff jitter uses `Math.random`, so retry *timing* is non-deterministic. This
  does not touch the classification *output*; the determinism guarantee
  ([0004](0004-llm-classification-and-deterministic-gating.md)) is about verdicts,
  not wall-clock, so the two are compatible.

## Alternatives considered

- **Rely on the classify stage's existing retry.** Rejected: it has no backoff
  (hammers a rate-limited provider), no timeout (a hung call stalls the diff),
  and spends the `needs-review` safety net on recoverable blips.
- **Add a retrying HTTP client** (e.g. `got`, `axios-retry`). Rejected: it breaks
  the zero-dependency posture ([0009](0009-default-classifier-over-fetch.md)) for
  a policy that is ~40 lines over `fetch`.
- **Put resilience in the pipeline.** Rejected: transport concerns belong with
  the provider adapter. A consumer that injects its own `Classifier` should bring
  its own transport policy, not inherit ours through the engine.
