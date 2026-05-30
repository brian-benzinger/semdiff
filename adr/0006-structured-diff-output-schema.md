# 0006. Stable structured diff schema as the public contract

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

`semdiff` produces output for two very different consumers:

- **Machines** — the downstream application stores diffs, drives an
  as-of-date/diff view, and may key further logic on what changed. It needs a
  stable, typed, parseable shape.
- **Humans** — a developer at a terminal wants a readable summary that
  highlights substantive changes and hides cosmetic noise.

If the human-readable rendering is the source of truth, machine consumers are
forced to parse prose — brittle and unversionable. The structured form must be
primary, with human output derived from it.

Because [0001](0001-standalone-domain-neutral-engine.md) forbids domain coupling,
the schema must be expressive enough for a regulatory consumer (spans for
citation integrity, confidence for review triage) without naming anything
regulation-specific.

## Decision

Define a **stable, versioned, structured diff as the engine's primary output**,
and render all human-readable views from it.

The structured diff is a typed object (emitted as JSON from the CLI) carrying at
least:

- A **schema version**, so consumers can evolve safely.
- **Run provenance**: the model id, prompt version, and engine version that
  produced it — the reproducibility stamp from
  [0004](0004-llm-classification-and-deterministic-gating.md).
- An ordered list of **changes**, each with:
  - a **type** — `insertion`, `deletion`, `modification`, or `move`;
  - a **classification** — `substantive` or `cosmetic`;
  - **spans** locating the change in both inputs (offsets / unit ids in version A
    and version B), so a consumer can pin a change to an exact source location —
    the foundation for the application's citation integrity;
  - for substantive modifications, a short **description** of what changed;
  - a **confidence** signal and a `needs-review` flag for low-confidence or
    failed classifications.
- **Summary counts** (substantive vs cosmetic, by type) for quick triage.

Design rules:

- The schema is **additive-by-default**; breaking changes bump the schema version
  and get their own ADR.
- The schema names **nothing domain-specific**. Citation pinning is expressed as
  generic spans; the consumer maps spans to its own citation model.
- Human-readable CLI output (and any other rendering) is a **pure function of the
  structured diff** — never a parallel source of truth.

## Consequences

**Easier**
- Machine consumers integrate against a typed, versioned contract; human output
  is a view, so the two never drift.
- Spans give the downstream application precise source anchoring for citation
  integrity without `semdiff` knowing what a citation is.
- Confidence and `needs-review` make the structured diff directly usable for
  human-review triage and for the eval harness's scoring
  ([0005](0005-eval-harness-and-determinism-layer.md)).

**Harder**
- We carry schema-versioning discipline and a derive-from-structured rule for all
  rendering, which is more upfront design than printing strings. This is the cost
  of a contract worth depending on.
- Span semantics must be defined precisely (offsets vs unit ids, behavior under
  moves) and held stable; ambiguity here propagates straight into the consumer's
  citation accuracy.

## Alternatives considered

- **Human-readable text as the primary output.** Rejected: forces machines to
  parse prose and makes the contract unversionable.
- **Unified-diff / patch format.** Rejected as the primary shape: it encodes
  textual edits, not substantive-vs-cosmetic classification, confidence, or
  provenance. It may be offered as an optional *rendering* of the structured diff.
- **Domain-specific fields (e.g. an explicit `citation` object).** Rejected:
  violates [0001](0001-standalone-domain-neutral-engine.md). Generic spans give
  the consumer everything needed to build citations without coupling the engine.
