# 0003. Meaning-aware diff pipeline: segment → align → classify

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

The core promise is to surface *substantive* changes and suppress *cosmetic*
ones. Two naive approaches both fail:

- **Pure textual diff** (line/character/token) is deterministic and free but
  semantically blind: it cannot tell a tightened threshold from a reflowed
  paragraph, so it produces noise and misses quiet substance.
- **Whole-document LLM diff** ("here are two documents, list the meaningful
  changes") is semantically capable but slow, expensive, non-reproducible, and
  prone to drift, omission, and hallucinated changes on long inputs. It also
  scales its cost with the *entire* document on every run, even when almost
  nothing changed.

We want the determinism, cheapness, and precision of textual methods for the 95%
of content that is unchanged or trivially changed, and the semantic judgment of
an LLM applied surgically to the small fraction that genuinely changed.

## Decision

Adopt a three-stage pipeline. Each stage has a single responsibility and a typed
boundary, so each can be tested and swapped independently.

```
        ┌──────────┐     ┌────────┐     ┌──────────┐
A, B ─▶ │ segment  │ ─▶  │ align  │ ─▶  │ classify │ ─▶ structured diff
        └──────────┘     └────────┘     └──────────┘
         local, det.      local, det.    LLM, gated
```

1. **Segment** — split each input into comparable units (sentence/clause level,
   with structural cues such as enumerated clauses preserved as metadata). Local
   and deterministic. Granularity is configurable because the right unit differs
   across domains.

2. **Align** — match units across the two versions using a deterministic local
   pass: exact matches, then normalized near-matches (whitespace, casing,
   punctuation, and numbering collapsed for comparison), then a similarity
   measure to pair the survivors and detect insertions/deletions/moves. The
   output is a set of aligned pairs, each tagged `unchanged`, `trivial-change`,
   or `candidate` (materially different text). No LLM runs here.

3. **Classify** — send **only the `candidate` pairs** to the LLM, which returns,
   per pair, a structured verdict: `substantive` vs `cosmetic`, a short
   description of what changed for substantive ones, and a confidence signal.
   `unchanged` and `trivial-change` pairs bypass the model entirely.

The boundary between stage 2 and stage 3 is the cost/determinism gate: the
deterministic stages decide *what* the model sees, and the model sees as little
as correctness allows. See
[0004](0004-llm-classification-and-deterministic-gating.md) for the gating and
output discipline, and [0006](0006-structured-diff-output-schema.md) for the
emitted shape.

## Consequences

**Easier**
- Cost and nondeterminism scale with the *amount of change*, not document size:
  an unchanged document costs zero LLM calls.
- Each stage is independently unit-testable; the deterministic stages can be
  pinned with golden fixtures and need no model at all.
- The "ignore cosmetic edits" requirement is enforced twice — cheaply by
  normalization in `align`, then semantically by the model on what survives.

**Harder**
- Segmentation and alignment quality become load-bearing: a missed alignment can
  surface as a phantom insert+delete instead of a clean modification. This is the
  central engineering risk and is exactly what the eval harness
  ([0005](0005-eval-harness-and-determinism-layer.md)) must measure.
- The classifier sees pairs, not whole-document context, so cross-clause changes
  (a definition moved elsewhere that alters a distant clause's meaning) need
  explicit handling — passing limited neighboring context, or a structural
  reconciliation pass — rather than being assumed away.

## Alternatives considered

- **Textual diff only.** Rejected: cannot meet the substantive-vs-cosmetic
  requirement at all.
- **Whole-document LLM diff.** Rejected as the primary path: cost and
  nondeterminism scale with document size rather than with change, and long-input
  recall/precision degrade. It remains a possible *fallback* mode for inputs that
  resist segmentation, but it is not the default.
- **Embedding-similarity classification** (cosine distance over unit embeddings
  to decide substantive vs cosmetic). Rejected as the decision-maker: similarity
  is a good *alignment* signal but a poor judge of substance — two sentences can
  be embedding-near yet differ on a number that changes the obligation. We use
  similarity for alignment, not for the substantive verdict.
