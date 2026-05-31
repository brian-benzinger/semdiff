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

Implemented (v0, pre-1.0). The pipeline — segment → align → classify → structured
diff — works end to end behind a per-file coverage gate (95% line / 90% branch).
The default classifier calls the Anthropic API (set `ANTHROPIC_API_KEY`), or you
can inject your own `Classifier`. Still ahead: the eval harness
([`adr/0005`](adr/0005-eval-harness-and-determinism-layer.md)) and
content-addressed verdict caching. Architecture decisions live in [`adr/`](adr/);
the working agreement for contributors (human and AI) is in
[`CLAUDE.md`](CLAUDE.md).

## Usage

As a library:

```ts
import { diff } from "semdiff";

// ANTHROPIC_API_KEY in the environment, or inject your own Classifier.
const result = await diff(before, after);
for (const change of result.changes) {
  console.log(change.type, change.classification, change.description ?? "");
}
```

As a CLI:

```sh
node src/cli.ts before.txt after.txt                      # structured diff as JSON
node src/cli.ts before.txt after.txt --granularity clause
```

Only genuinely-changed pairs reach the model; identical, cosmetic, inserted, or
deleted content is classified locally and needs no API key.

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
- **Emit** a stable, versioned structured diff (JSON); the CLI prints that JSON,
  and any human-readable rendering is a pure function of it (ADR-0006).

The full reasoning is in the ADRs:

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-standalone-domain-neutral-engine.md) | Standalone, domain-neutral engine separate from any application |
| [0002](adr/0002-typescript-node-library-and-cli.md) | TypeScript / Node, distributed as both a library and a CLI |
| [0003](adr/0003-meaning-aware-diff-pipeline.md) | Segment → align → classify pipeline |
| [0004](adr/0004-llm-classification-and-deterministic-gating.md) | LLM-backed classification, gated and structured |
| [0005](adr/0005-eval-harness-and-determinism-layer.md) | The eval + determinism layer is the core contribution |
| [0006](adr/0006-structured-diff-output-schema.md) | Stable structured diff schema as the public contract |
| [0007](adr/0007-character-offset-span-semantics.md) | Spans are half-open character offsets into the literal input |
| [0008](adr/0008-vitest-and-per-file-coverage-gate.md) | Vitest with a per-file coverage gate |
| [0009](adr/0009-default-classifier-over-fetch.md) | The default classifier calls the Anthropic API over fetch |

## License

[MIT](LICENSE) © 2026 Brian Benzinger
