# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this repo is

`semdiff` is a **standalone, domain-neutral** meaning-aware diff engine, library,
and CLI. It surfaces *substantive* changes in prose (a changed threshold, a new
exemption, a shifted deadline) and suppresses *cosmetic* ones (whitespace,
renumbering, punctuation, synonym swaps).

It has **no backend**. It takes two text inputs and returns a structured diff.
The only external dependency it needs at runtime is the LLM provider the caller
configures.

## What this repo is NOT

Hold this line — it is the project's identity, not a guideline:

- **Not domain-specific.** No regulations, no legal terms, no
  sustainability-specific code or vocabulary anywhere in the engine. Domain
  knowledge enters only as caller-supplied configuration/data. If you find
  yourself importing or hardcoding anything regulatory, stop — that belongs in
  the downstream `sust-reg-reporter` application, not here.
- **Not a scraper or ingestion pipeline.** `semdiff` does not fetch, crawl,
  schedule, or store. It diffs two inputs it is handed.
- **Not interpretive.** It reports *what* changed, never *what it means* for the
  reader. No advice, legal or otherwise.
- **Not a thin LLM wrapper.** The determinism and quality layer is the product
  (see ADR 0005). Do not "simplify" by removing caching, validation, gating,
  confidence flags, or the eval harness.

When a request would blur any of these lines, surface the conflict rather than
quietly crossing it.

## Read the ADRs first

Design decisions and their rationale live in [`adr/`](adr/). Before changing
architecture, read the relevant record. The current decisions:

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-standalone-domain-neutral-engine.md) | Standalone, domain-neutral engine separate from the application |
| [0002](adr/0002-typescript-node-library-and-cli.md) | TypeScript / Node; library + CLI from one package |
| [0003](adr/0003-meaning-aware-diff-pipeline.md) | Pipeline: segment → align → classify |
| [0004](adr/0004-llm-classification-and-deterministic-gating.md) | LLM as a gated, structured classifier |
| [0005](adr/0005-eval-harness-and-determinism-layer.md) | Eval + determinism layer is the core contribution |
| [0006](adr/0006-structured-diff-output-schema.md) | Stable structured diff schema is the public contract |
| [0007](adr/0007-character-offset-span-semantics.md) | Spans are half-open character offsets into the literal input |
| [0008](adr/0008-vitest-and-per-file-coverage-gate.md) | Vitest with a per-file coverage gate (95% line / 90% branch) |
| [0009](adr/0009-default-classifier-over-fetch.md) | The default classifier calls the Anthropic API over fetch (zero-dependency) |
| [0010](adr/0010-move-detection-by-content-match.md) | Move detection by content match (deterministic, cosmetic) |
| [0011](adr/0011-classify-one-sided-changes.md) | Classify one-sided changes (insertions/deletions) through the model |
| [0012](adr/0012-classifier-resilience-timeout-and-retry.md) | Default classifier resilience: per-call timeout and bounded retry with backoff |
| [0013](adr/0013-concurrent-classification.md) | Concurrent classification with a bounded pool |

If you make a decision that changes or supersedes one of these, **add a new
ADR** — do not silently edit an accepted one. Follow the conventions in
[`adr/README.md`](adr/README.md).

## Working agreement

- **The structured diff is the source of truth.** Any human-readable output is a
  pure function of it (ADR 0006). Never let the two drift.
- **Gate the model.** Only genuinely-changed pairs reach the LLM. Unchanged and
  trivially-changed content must never cost a call (ADR 0003, 0004).
- **Validate every model response** against the schema; retry, then fall back to
  a flagged `needs-review` result. Never silently drop or fabricate a verdict.
- **Cache by content.** Identical `(normalized pair, prompt version, model id)`
  returns the cached verdict. This is the primary determinism and cost guarantee.
- **Keep the provider behind an interface.** Depend on the `Classifier`
  abstraction, not a concrete SDK. The default model is the latest capable Claude
  model, injected via config.
- **Evals gate releases.** If you touch segmentation, alignment, the prompt, or
  the model, run the eval harness and report precision/recall for substantive
  change detection. A change without an eval result is not done.

## Conventions

- **Language:** TypeScript on a recent LTS Node (ADR 0002). The same artifact
  must run locally (CLI) and on AWS Lambda (library).
- **Tests:** [Vitest](https://vitest.dev) (`npm test`), enforced by a per-file
  coverage gate of 95% line / 90% branch (ADR 0008); `all: true` means an
  untested module counts as 0% and fails. Deterministic stages (`segment`,
  `align`) get golden-fixture unit tests with no model; the classifier is tested
  against a mocked `Classifier`. The eval harness is separate and may touch the
  real model.
- **Commits:** clear, descriptive messages. Branch from the development branch;
  do not commit directly to `main`.
- **Always raise a PR.** Every change ships as a pull request — never push
  straight to `main`, and don't leave work sitting on a branch without one.
  After pushing a feature branch, open the PR (or update the existing one) so
  the change is reviewable.
- **Determinism in tooling:** prefer the project's dedicated tools/scripts;
  pin versions; avoid introducing nondeterminism into builds or tests.

## Status

Implemented (v0, pre-1.0) and packaged for distribution. The full pipeline —
segment → align → classify → structured diff — works end to end behind the
per-file coverage gate, with the default Anthropic classifier, content-addressed
cache, CLI, and eval harness in place. The package builds to `dist/` (ESM +
bundled `.d.ts`, zero runtime dependencies) via `npm run build` and is shaped for
publishing to npm as a library + CLI (ADR-0002).

Code follows the decisions recorded above; when reality diverges from an ADR,
write the next ADR rather than letting docs and code disagree.
