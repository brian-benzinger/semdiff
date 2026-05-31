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
| 2026-05-31 | 0.1.0 | claude-haiku-4-5 | 0 | 32 | 0.97 | 1.00 | 0.94 | 0.97 | 1 | 0 | 0.958 |
| 2026-05-31 | 0.1.0 | claude-sonnet-4-6 | 0 | 32 | 0.97 | 1.00 | 0.94 | 0.97 | 1 | 0 | 0.936 |

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

### 2026-05-31 — engine 0.1.0 (Haiku 4.5, 32-case corpus)

First cross-model run, scoring `claude-haiku-4-5` against the same 32 cases via
the `MODEL` override. Haiku scores **31/32** — and the one it misses is the
signal the boundary cases were built to surface.

- **The miss is the costly kind.** `boundary now inclusive` (`over $100 → $100 or
  more`) is called **cosmetic** — Haiku read the exclusive→inclusive boundary
  shift as a rewording. That is a missed *substantive* change (recall 0.94),
  exactly the expensive error under ADR-0005; with zero false flags, Haiku's
  failure mode here is under-detection, not noise. Opus classified the same case
  correctly.
- **It is confidently wrong.** `meanConfidenceIncorrect` is **0.95**, within a
  hair of `meanConfidenceCorrect` (0.958). Haiku's confidence is flat
  (~0.95–0.99 across the whole corpus) and does not fall on the call it gets
  wrong, so the `needsReview` gate (confidence < 0.5) would **not** have flagged
  the miss. By contrast Opus's confidence tracked difficulty (0.85 on the
  subtlest calls) and it classified the boundary case correctly at 0.92.

**Read for the default-model choice.** Where missed substance is the expensive
error (ADR-0005), Haiku's combination of a substantive miss *and* uncalibrated
confidence is disqualifying as the default — the cheap model is wrong on exactly
the kind of case you most need caught, and its confidence won't warn you. Opus's
calibration is what makes the confidence/`needsReview` signal trustworthy, and is
worth the premium for this use. Haiku stays viable where cost dominates and a
boundary miss is acceptable.

```
model: claude-haiku-4-5
corpus: 32 cases

ok   threshold raised: substantive (0.99)
ok   deadline shortened: substantive (0.99)
ok   negation added: substantive (0.99)
ok   scope narrowed: substantive (0.99)
ok   casing only: cosmetic (0.99)
ok   punctuation only: cosmetic (0.95)
ok   reworded, same meaning: cosmetic (0.95)
ok   renumbered clause: cosmetic (0.95)
ok   insert: new obligation: substantive (0.95)
ok   insert: added exception: substantive (0.95)
ok   insert: boilerplate closing: cosmetic (0.85)
ok   delete: removed condition: substantive (0.95)
ok   delete: removed exemption: substantive (0.95)
ok   delete: boilerplate greeting: cosmetic (0.85)
ok   number formatting only: cosmetic (0.95)
ok   equivalent duration: cosmetic (0.95)
ok   spelled-out count: cosmetic (0.95)
ok   equivalent currency notation: cosmetic (0.95)
ok   double negative simplified: cosmetic (0.95)
ok   active to passive voice: cosmetic (0.95)
ok   synonym, same threshold: cosmetic (0.95)
ok   permission to requirement: substantive (0.95)
ok   recommendation to requirement: substantive (0.95)
ok   timing inverted: substantive (0.99)
MISS boundary now inclusive: cosmetic (0.95)
ok   small number change: substantive (0.99)
ok   quantifier widened: substantive (0.99)
ok   and to or: substantive (0.99)
ok   include to exclude: substantive (0.99)
ok   vague to specific deadline: substantive (0.99)
ok   insert: convenience disclaimer: cosmetic (0.95)
ok   delete: removed benefit: substantive (0.95)

{
  "total": 32,
  "accuracy": 0.96875,
  "precision": 1,
  "recall": 0.9444444444444444,
  "f1": 0.9714285714285714,
  "missedSubstantive": 1,
  "falseFlags": 0,
  "meanConfidenceCorrect": 0.9577419354838703,
  "meanConfidenceIncorrect": 0.95
}
```

### 2026-05-31 — engine 0.1.0 (Sonnet 4.6, 32-case corpus)

Third cross-model run: `claude-sonnet-4-6`, the mid-tier option ($15 vs $25 per
1M output — about 60% of Opus's cost), against the same 32 cases. Sonnet also scores **31/32**, on the
*same* miss as Haiku — `boundary now inclusive` called **cosmetic** at 0.95 — but
the calibration picture is the opposite of Haiku's, and it corrects the earlier
read.

- **Sonnet is genuinely calibrated.** Its confidence on correct calls spans
  0.60–1.00, and the low end is exactly the subtle cases: boilerplate deletion
  (0.60), the convenience-disclaimer insertion (0.60), boilerplate closing
  (0.70), the renumbered clause (0.75). `meanConfidenceCorrect` is **0.936** —
  *lower* than Haiku's 0.958, and that is the healthy direction: Sonnet is honest
  about the hard calls instead of uniformly sure. So `needsReview` is a
  meaningful lever on Sonnet (its low-confidence calls really are the borderline
  ones); on Haiku it was near-useless (everything ≥ 0.85).
- **But it is still confidently wrong on the boundary miss.** Like Haiku,
  `meanConfidenceIncorrect` is **0.95** — good general calibration did not save it
  on the one case it was fooled by, and `needsReview` (< 0.5) would not flag it.

**This corrects the previous run's hypothesis.** Calibration is *not* a
frontier-only property — Sonnet 4.6 calibrates as well as Opus. What is
frontier-tier is the specific semantic catch: the exclusive→inclusive boundary
shift in `over $100 → $100 or more` is missed, confidently, by **both** Sonnet
and Haiku, and caught only by Opus (at 0.92). That one case is now a clean
model-floor sentinel.

**Read for the default-model choice.** Opus 4.8 stays the default where missed
substance is the expensive error — it is the only model that catches the boundary
case. The economics narrow the middle: Sonnet 4.6 saves only ~40% on output ($15
vs $25 per 1M) and shares the blind spot, so it is hard to justify over Opus when
correctness matters — its real edge is over Haiku, on calibration, not cost.
Haiku 4.5 is the deep cost cut (~1/5 of Opus output, $5 per 1M) but pairs the
same blind spot with flat confidence that hides it. Net: pay for Opus where a
missed boundary is costly; drop to Haiku where cost dominates and that miss is
acceptable; Sonnet's niche is narrow.

```
model: claude-sonnet-4-6
corpus: 32 cases

ok   threshold raised: substantive (1)
ok   deadline shortened: substantive (1)
ok   negation added: substantive (1)
ok   scope narrowed: substantive (0.99)
ok   casing only: cosmetic (0.99)
ok   punctuation only: cosmetic (0.95)
ok   reworded, same meaning: cosmetic (0.95)
ok   renumbered clause: cosmetic (0.75)
ok   insert: new obligation: substantive (0.99)
ok   insert: added exception: substantive (0.97)
ok   insert: boilerplate closing: cosmetic (0.7)
ok   delete: removed condition: substantive (0.97)
ok   delete: removed exemption: substantive (0.99)
ok   delete: boilerplate greeting: cosmetic (0.6)
ok   number formatting only: cosmetic (0.99)
ok   equivalent duration: cosmetic (0.97)
ok   spelled-out count: cosmetic (0.97)
ok   equivalent currency notation: cosmetic (0.95)
ok   double negative simplified: cosmetic (0.95)
ok   active to passive voice: cosmetic (0.95)
ok   synonym, same threshold: cosmetic (0.95)
ok   permission to requirement: substantive (0.95)
ok   recommendation to requirement: substantive (0.95)
ok   timing inverted: substantive (0.99)
MISS boundary now inclusive: cosmetic (0.95)
ok   small number change: substantive (1)
ok   quantifier widened: substantive (0.99)
ok   and to or: substantive (0.99)
ok   include to exclude: substantive (1)
ok   vague to specific deadline: substantive (0.99)
ok   insert: convenience disclaimer: cosmetic (0.6)
ok   delete: removed benefit: substantive (0.99)

{
  "total": 32,
  "accuracy": 0.96875,
  "precision": 1,
  "recall": 0.9444444444444444,
  "f1": 0.9714285714285714,
  "missedSubstantive": 1,
  "falseFlags": 0,
  "meanConfidenceCorrect": 0.9364516129032256,
  "meanConfidenceIncorrect": 0.95
}
```
