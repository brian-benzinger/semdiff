# Architecture Decision Records

This directory records the significant design decisions for `semdiff` and the
reasoning behind them. Each record is immutable once accepted: we do not edit a
decision to reflect a change of mind — we add a new ADR that supersedes it. The
trail of *why* is as valuable as the *what*.

The format is a lightweight [Michael Nygard][nygard] / [MADR][madr] hybrid:

- **Status** — Proposed, Accepted, Superseded by `NNNN`, or Deprecated.
- **Context** — the forces at play: requirements, constraints, what we know.
- **Decision** — what we are doing, in active voice.
- **Consequences** — what becomes easier and what becomes harder.
- **Alternatives considered** — the roads not taken and why.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-standalone-domain-neutral-engine.md) | Standalone, domain-neutral engine separate from any application | Accepted |
| [0002](0002-typescript-node-library-and-cli.md) | TypeScript / Node, distributed as a library and a CLI | Accepted |
| [0003](0003-meaning-aware-diff-pipeline.md) | Meaning-aware diff pipeline: segment → align → classify | Accepted |
| [0004](0004-llm-classification-and-deterministic-gating.md) | LLM-backed classification with deterministic gating | Accepted |
| [0005](0005-eval-harness-and-determinism-layer.md) | The eval harness and determinism layer are the core contribution | Accepted |
| [0006](0006-structured-diff-output-schema.md) | Stable structured diff schema as the public contract | Accepted |
| [0007](0007-character-offset-span-semantics.md) | Spans are half-open character offsets into the literal input | Accepted |
| [0008](0008-vitest-and-per-file-coverage-gate.md) | Vitest with a per-file coverage gate (95% line / 90% branch) | Accepted |
| [0009](0009-default-classifier-over-fetch.md) | The default classifier calls the Anthropic API over fetch (zero-dependency) | Accepted |
| [0010](0010-move-detection-by-content-match.md) | Move detection by content match (deterministic, cosmetic) | Accepted |

## Conventions

- Filenames are `NNNN-kebab-case-title.md`, zero-padded, monotonically
  increasing. Numbers are never reused.
- A new ADR that reverses an old one sets the old one's status to
  `Superseded by NNNN` and explains the change in its own Context.
- Keep each ADR to one decision. If you are tempted to record two, write two.

[nygard]: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
[madr]: https://adr.github.io/madr/
