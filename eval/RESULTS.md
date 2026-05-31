# Eval results

Curated, human-reviewed snapshots of the eval harness ([ADR-0005](../adr/0005-eval-harness-and-determinism-layer.md)).
Each row is one deliberate checkpoint — typically a release — recording how the
default classifier scored on the labeled corpus ([`src/eval/corpus.ts`](../src/eval/corpus.ts)).

This file is the durable, citable evidence behind quality claims; per ADR-0005,
evals gate releases. It is **not** a log of every run: raw per-run output is
nondeterministic (it calls the model) and is gitignored. Add a row here only
when you have reviewed the result and consider it a baseline worth keeping.

Reproduce a row with:

```sh
ANTHROPIC_API_KEY=sk-ant-... npm run eval                         # the default model
ANTHROPIC_API_KEY=sk-ant-... MODEL=claude-haiku-4-5 npm run eval  # a specific model
```

The runner prints the resolved `model:` and `corpus:` size at the top of its
output, so a pasted run records exactly what produced it — the `Model` column
below is read straight from that line, not assumed.

`substantive` is the positive class. The two error types are tracked separately
because their costs differ (ADR-0005): **missed** is a substantive change called
cosmetic (the costly error), **false flags** is a cosmetic change called
substantive (noise).

## Snapshots

| Date | Engine | Model | Prompt | Corpus | Accuracy | Precision | Recall | F1 | Missed | False flags | Mean conf (correct) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05-31 | 0.1.0 | claude-opus-4-8 | 0 | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 0 | 0.955 |
| 2026-05-31 | 0.1.0 | claude-opus-4-8 | 0 | 32 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 0 | 0.945 |

### 2026-05-31 — engine 0.1.0

First full-corpus run after one-sided classification ([ADR-0011](../adr/0011-classify-one-sided-changes.md))
added insertion/deletion cases to the corpus. All 14 cases correct, including the
six one-sided cases. Confidence on correct calls was tightly banded (0.90–0.99);
the lowest-confidence calls were the genuinely harder judgments (meaning-preserving
rewording, boilerplate insertion/deletion), which is the desired calibration.

Notably, the three cosmetic one-sided cases (boilerplate insertion and deletion)
were classified `cosmetic` rather than defaulted to `substantive` — the precision
gap ADR-0011 set out to close.

```
ok   threshold raised: substantive (0.99)
ok   deadline shortened: substantive (0.99)
ok   negation added: substantive (0.99)
ok   scope narrowed: substantive (0.97)
ok   casing only: cosmetic (0.97)
ok   punctuation only: cosmetic (0.97)
ok   reworded, same meaning: cosmetic (0.9)
ok   renumbered clause: cosmetic (0.95)
ok   insert: new obligation: substantive (0.97)
ok   insert: added exception: substantive (0.95)
ok   insert: boilerplate closing: cosmetic (0.9)
ok   delete: removed condition: substantive (0.96)
ok   delete: removed exemption: substantive (0.96)
ok   delete: boilerplate greeting: cosmetic (0.9)

{
  "total": 14,
  "accuracy": 1,
  "precision": 1,
  "recall": 1,
  "f1": 1,
  "missedSubstantive": 0,
  "falseFlags": 0,
  "meanConfidenceCorrect": 0.955,
  "meanConfidenceIncorrect": 0
}
```

> **Scope note.** These are deliberately clear, curated cases — a regression
> tripwire and a soundness check, not a claim of real-world accuracy. A perfect
> score here means no plumbing bug, no systematic blind spot, and good
> calibration; it does not generalize to borderline prose. Growing the corpus
> with harder and adversarial cases over time is the ongoing ADR-0005 work.

### 2026-05-31 — engine 0.1.0 (32-case corpus)

The corpus grew from 14 to 32 cases with a batch of **boundary** cases built to
trip the two failure modes: over-normalization (a cosmetic edit flagged
substantive) and missed substance (a substantive edit called cosmetic). They are
paired where useful — e.g. `$1,000 → $1000` (cosmetic) against `$1,000 → $1,050`
(substantive) from the same A — so the score has to separate formatting from
value.

Opus still scores **32/32**. The cases meant to be hard were answered correctly:
`over $100 → $100 or more` (inclusive boundary) as substantive; `12 months → one
year`, `not permitted → prohibited`, and active→passive held as cosmetic.
Confidence tracks difficulty — the subtlest calls land lowest (0.85 on
`equivalent currency notation` and `permission → requirement`) and the clear-cut
ones reach 0.99 — which is the calibration we want even though nothing was wrong.

`meanConfidenceIncorrect` is still 0 because nothing was missed, so calibration
on *wrong* answers remains untested. A perfect score now means this synthetic
corpus has reached its ceiling as a discriminator for Opus 4.8; the next signal
comes from a cheaper model against the same corpus (the `MODEL` override above)
or a corpus drawn from real consumer documents, where ambiguity is natural.

```
model: claude-opus-4-8
corpus: 32 cases

ok   threshold raised: substantive (0.99)
ok   deadline shortened: substantive (0.99)
ok   negation added: substantive (0.99)
ok   scope narrowed: substantive (0.97)
ok   casing only: cosmetic (0.97)
ok   punctuation only: cosmetic (0.97)
ok   reworded, same meaning: cosmetic (0.9)
ok   renumbered clause: cosmetic (0.95)
ok   insert: new obligation: substantive (0.97)
ok   insert: added exception: substantive (0.95)
ok   insert: boilerplate closing: cosmetic (0.9)
ok   delete: removed condition: substantive (0.97)
ok   delete: removed exemption: substantive (0.97)
ok   delete: boilerplate greeting: cosmetic (0.9)
ok   number formatting only: cosmetic (0.96)
ok   equivalent duration: cosmetic (0.92)
ok   spelled-out count: cosmetic (0.96)
ok   equivalent currency notation: cosmetic (0.85)
ok   double negative simplified: cosmetic (0.95)
ok   active to passive voice: cosmetic (0.95)
ok   synonym, same threshold: cosmetic (0.95)
ok   permission to requirement: substantive (0.85)
ok   recommendation to requirement: substantive (0.9)
ok   timing inverted: substantive (0.95)
ok   boundary now inclusive: substantive (0.92)
ok   small number change: substantive (0.99)
ok   quantifier widened: substantive (0.98)
ok   and to or: substantive (0.97)
ok   include to exclude: substantive (0.99)
ok   vague to specific deadline: substantive (0.95)
ok   insert: convenience disclaimer: cosmetic (0.85)
ok   delete: removed benefit: substantive (0.97)

{
  "total": 32,
  "accuracy": 1,
  "precision": 1,
  "recall": 1,
  "f1": 1,
  "missedSubstantive": 0,
  "falseFlags": 0,
  "meanConfidenceCorrect": 0.945,
  "meanConfidenceIncorrect": 0
}
```

> The `model:` / `corpus:` header on this block is the runner output, not a hand
> label — the first run that lacked it is why a later "haiku" attempt couldn't be
> trusted (the override wasn't wired, so it was opus again). It is now.
