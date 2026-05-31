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
ANTHROPIC_API_KEY=sk-ant-... npm run eval
```

`substantive` is the positive class. The two error types are tracked separately
because their costs differ (ADR-0005): **missed** is a substantive change called
cosmetic (the costly error), **false flags** is a cosmetic change called
substantive (noise).

## Snapshots

| Date | Engine | Model | Prompt | Corpus | Accuracy | Precision | Recall | F1 | Missed | False flags | Mean conf (correct) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05-31 | 0.1.0 | claude-opus-4-8 | 0 | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 0 | 0.955 |

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
