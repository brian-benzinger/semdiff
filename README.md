# semdiff

> Meaning-aware diff engine and CLI that surfaces substantive changes in prose, not cosmetic edits.

`semdiff` answers a question that a line-based diff cannot: **did the meaning
change?** It ignores reflowed whitespace, renumbered clauses, punctuation
normalization, and synonym swaps that carry no new obligation, and it flags the
edits that actually alter substance — a tightened threshold, a new exemption, a
shifted deadline, an added requirement.

It is a standalone, domain-neutral library and CLI. It has no backend and no
network dependencies of its own beyond the LLM provider you configure. The name
is deliberately generic: `semdiff` is useful to anyone diffing prose where
meaning matters more than characters — contracts, policies, terms of service,
documentation, or regulations.

> [!NOTE]
> `semdiff` originated as the engine behind a sustainability-regulation change
> tracker, but it is built and packaged to stand on its own. See
> [`adr/0001`](adr/0001-standalone-domain-neutral-engine.md) for the scope
> boundary between this engine and any application that consumes it.

## Why not just `diff`?

A character- or line-based diff is precise but semantically blind. Given two
revisions of a paragraph, it reports *that* bytes changed, not *whether the
obligation changed*. In a legal or policy setting that produces two failure
modes that are both expensive:

- **Noise.** Cosmetic edits (formatting, renumbering, citation-style changes)
  light up as diffs and bury the one change that matters.
- **Missed substance.** A reworded sentence that quietly narrows an exemption
  looks like a small token-level edit and gets dismissed.

`semdiff` classifies each aligned change as **substantive** or **cosmetic**, and
for substantive changes describes *what* changed, with a confidence signal and a
pointer back to the exact spans involved.

## What it is not

- It does **not** interpret or give legal advice. It reports what changed
  between two texts; it does not tell you what the change means for you.
- It is **not** a generic web scraper or an ingestion pipeline. It diffs two
  inputs you hand it.
- It is **not** nondeterministic by accident. The quality and determinism layer
  (caching, schema validation, confidence flags, an eval harness) is the point —
  see [`adr/0005`](adr/0005-eval-harness-and-determinism-layer.md).

## Status

Pre-implementation. This commit captures the **design** only: the architecture
decisions live in [`adr/`](adr/) and the working agreement for contributors
(human and AI) lives in [`CLAUDE.md`](CLAUDE.md). Code follows the decisions
recorded there.

## Design at a glance

```
input A ─┐
         ├─▶ segment ─▶ align ─▶ classify ─▶ structured diff
input B ─┘             (cheap,    (LLM, gated   (substantive vs
                        local)     on change)    cosmetic + spans)
```

- **Segment** both texts into comparable units (clauses / sentences).
- **Align** units across the two versions with a cheap, deterministic local pass
  (no LLM): exact and near-exact matches are settled here.
- **Classify** only the genuinely changed pairs with the LLM, returning a
  structured, schema-validated verdict. Unchanged and trivially-changed pairs
  never reach the model, which bounds cost and nondeterminism.
- **Emit** a structured diff (stable JSON) plus human-readable CLI output.

The full reasoning is in the ADRs:

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-standalone-domain-neutral-engine.md) | Standalone, domain-neutral engine separate from any application |
| [0002](adr/0002-typescript-node-library-and-cli.md) | TypeScript / Node, distributed as both a library and a CLI |
| [0003](adr/0003-meaning-aware-diff-pipeline.md) | Segment → align → classify pipeline |
| [0004](adr/0004-llm-classification-and-deterministic-gating.md) | LLM-backed classification, gated and structured |
| [0005](adr/0005-eval-harness-and-determinism-layer.md) | The eval + determinism layer is the core contribution |
| [0006](adr/0006-structured-diff-output-schema.md) | Stable structured diff schema as the public contract |

## License

[MIT](LICENSE) © 2026 Brian Benzinger
