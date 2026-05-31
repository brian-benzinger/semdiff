# 0011. Classify one-sided changes

- **Status:** Accepted
- **Date:** 2026-05-31

## Context

[0006](0006-structured-diff-output-schema.md) gives every change a
`classification` (substantive or cosmetic), including insertions and deletions.
But the engine **defaulted** one-sided changes to `substantive` without asking
the model: a deleted boilerplate line was reported substantive (noise), and an
inserted clause was never actually judged. That is the recall/precision gap
[0004](0004-llm-classification-and-deterministic-gating.md) exists to close —
the model, not a default, should decide whether an added or removed span carries
meaning.

[0010](0010-move-detection-by-content-match.md) already removes the largest
source of spurious one-sided changes (relocations). The remaining real
insertions and deletions deserve the same judgment a modification gets.

## Decision

Classify one-sided changes through the model, exactly like modifications.

- **`CandidatePair` carries a `type`** (`insertion` | `deletion` | `modification`)
  and **nullable spans**: for an insertion `a` is `""` and `spanA` is `null`; for
  a deletion `b` is `""` and `spanB` is `null`.
- `diff` sends **all** `candidate` pairings — one-sided and two-sided — to the
  classify stage; the resulting `Change` takes its `type` from the candidate and
  its classification/description/confidence from the verdict.
- The default classifier's prompt is told that an empty side means an insertion
  or removal, and to judge whether it is substantive or cosmetic.
- Only `unchanged`, `trivial-change`, and `move` stay deterministic and
  model-free.

## Consequences

**Easier**
- Closes the recall/precision gap: a deleted boilerplate line can be `cosmetic`,
  and an inserted obligation is actually judged rather than assumed.
- Uniform handling — insertions, deletions, and modifications all flow through
  one path and inherit the same validate → retry → needs-review safety net
  ([0004](0004-llm-classification-and-deterministic-gating.md)).

**Harder**
- More model calls: every real insertion and deletion now reaches the model, not
  just two-sided modifications. The content-hash gate on the consumer side and
  the verdict cache ([0004](0004-llm-classification-and-deterministic-gating.md))
  blunt the cost.
- A diff containing any real change now needs a provider; the model-free surface
  shrinks to identical, cosmetic, and relocated content.

## Alternatives considered

- **Keep defaulting one-sided changes to substantive.** Rejected: the gap above
  — it over-reports cosmetic deletions and never judges insertions.
- **Rule-based heuristics for one-sided changes** (e.g. length thresholds).
  Rejected: the substantive/cosmetic judgment is the model's job
  ([0004](0004-llm-classification-and-deterministic-gating.md)); a deterministic
  rule would re-introduce the guessing this ADR removes.
