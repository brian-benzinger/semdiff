# 0010. Move detection by content match

- **Status:** Accepted
- **Date:** 2026-05-31

## Context

[0003](0003-meaning-aware-diff-pipeline.md) lists the segment → align → classify
pipeline and flags move detection as a deferred reconciliation risk: a unit that
is relocated surfaces as a deletion in one place plus an insertion in another.
[0006](0006-structured-diff-output-schema.md) already includes `move` as a
`ChangeType`, but the engine never emitted one — relocations showed up as noisy
delete + insert pairs, and the `move` type was dead.

A relocation of identical content is not a substantive edit; reporting it as a
deletion and an unrelated insertion both overstates the change and loses the
relationship between the two spans.

## Decision

After alignment, a deterministic post-pass (`detectMoves`) re-pairs a **deletion
whose normalized content matches an insertion elsewhere** into a single `move`.

- Matching uses the **same normalized key as alignment** (case, punctuation, and
  leading enumeration collapsed), so a clause that was renumbered *and* moved is
  still recognized as a move.
- The move keeps the deletion's **old span** (`a`) and the insertion's **new
  span** (`b`), so the consumer can cite either ([0007](0007-character-offset-span-semantics.md)).
- Matching is **1:1** — an insertion is consumed by at most one deletion;
  unmatched insertions/deletions stay one-sided changes.
- A move is treated as a **deterministic, cosmetic** change: the text did not
  change, only its position, so it is emitted with full confidence, no
  `needs-review` flag, and **no model call**.

## Consequences

**Easier**
- Completes the four change types; a relocation is one `move` instead of a
  delete + insert, cutting noise.
- Deterministic and free — no model call, no nondeterminism, consistent with the
  gating philosophy ([0004](0004-llm-classification-and-deterministic-gating.md)).
- The consumer receives both old and new spans for one logical change.

**Harder**
- Only **exact-content** relocations are detected. Content that moved *and*
  changed remains a delete + insert (alignment's reconciliation limit stands).
- Classifying a move as **cosmetic** assumes relocation preserves meaning;
  moving a clause into a different scope could matter. A known v1 limitation —
  semantic-relocation judgment is future work.
- Move detection is content-only; it does not weigh distance or document
  structure.

## Alternatives considered

- **Keep deferring.** Rejected: leaves `move` unused and keeps emitting noisy,
  relationship-losing delete + insert pairs for plain relocations.
- **LLM-judged moves.** Rejected for v1: exact-content relocations are
  deterministic and need no model. Judging whether a relocation changes meaning
  is a later, model-backed refinement.
