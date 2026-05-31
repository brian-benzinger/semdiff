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
can inject your own `Classifier`, optionally wrapped with `withCache` so
identical changes are classified once (ADR-0004). The eval harness
([`adr/0005`](adr/0005-eval-harness-and-determinism-layer.md)) scores classifier
accuracy (`npm run eval`); curated result snapshots are in
[`eval/RESULTS.md`](eval/RESULTS.md). Architecture decisions live in [`adr/`](adr/);
the working agreement for contributors (human and AI) is in
[`CLAUDE.md`](CLAUDE.md).

## Install

```sh
npm install semdiff
```

The published package ships compiled ESM with bundled type declarations and has
**zero runtime dependencies** beyond the LLM provider you configure (ADR-0009).
It runs on Node ≥ 20, both locally (CLI) and on AWS Lambda (library).

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

As a CLI (installed globally, or via `npx`):

```sh
npx semdiff before.txt after.txt                      # structured diff as JSON
npx semdiff before.txt after.txt --granularity clause
```

From a checkout of this repo you can run the source directly without building —
`node src/cli.ts before.txt after.txt` — on a Node that strips TypeScript types.

Changed content — insertions, deletions, and modifications — is classified by
the model; identical, cosmetic, and relocated (moved) content is classified
locally and needs no API key.

## Configuration

The only thing `semdiff` needs to configure is the LLM provider. The common case
is **zero code**: set your key in the environment and the defaults handle the
rest.

### 1. Your API key (the only required setup)

```sh
export ANTHROPIC_API_KEY=sk-ant-...      # macOS/Linux
$env:ANTHROPIC_API_KEY = "sk-ant-..."    # PowerShell
```

Both the library and the CLI read `ANTHROPIC_API_KEY` automatically — no other
setup is needed. The key is only used when a change actually has to reach the
model; identical, cosmetic, and moved content never needs it.

### 2. Override the model or pass the key explicitly

The default model is **`claude-opus-4-8`** (the latest capable Claude). Override
it — or supply the key in code instead of the environment — per call:

```ts
import { diff } from "semdiff";

const result = await diff(before, after, {
  modelId: "claude-sonnet-4-6",          // any Anthropic model id; default: claude-opus-4-8
});
```

To pass the key in code (e.g. from your own secret store rather than the
environment), construct the default classifier explicitly and inject it:

```ts
import { diff, createDefaultClassifier } from "semdiff";

const classifier = createDefaultClassifier({
  apiKey: mySecret,                       // default: process.env.ANTHROPIC_API_KEY
  modelId: "claude-opus-4-8",             // optional
  timeoutMs: 60000,                       // optional; per-call timeout (ADR-0012)
  maxRetries: 2,                          // optional; retries on 429/5xx/network/timeout (ADR-0012)
});
const result = await diff(before, after, { classifier });
```

> The `modelId` you pass is also stamped into the result's `provenance`, so a
> diff always records which model produced it (ADR-0004).

> Each model call has a timeout and retries transient failures (429, 5xx, network
> errors, timeouts) with exponential backoff, honouring `Retry-After`;
> non-transient errors (400, auth) fail fast. Tune with `timeoutMs` / `maxRetries`,
> or set `maxRetries: 0` for a single attempt (ADR-0012).

### 3. Use a different provider entirely

`semdiff` depends on a small `Classifier` interface, not on Anthropic. To use
another provider (OpenAI, a local model, a mock for tests), implement
`classify` and inject it — the engine keeps its zero-dependency runtime and never
constructs the default classifier:

```ts
import { diff, type Classifier } from "semdiff";

const classifier: Classifier = {
  async classify(pair) {
    // pair: { type, a, b, spanA, spanB }  →  call your provider here
    return { classification: "substantive", confidence: 0.9, description: "…" };
  },
};
const result = await diff(before, after, { classifier });
```

Wrap any classifier with `withCache` so identical changes are classified once
(ADR-0004):

```ts
import { diff, createDefaultClassifier, withCache } from "semdiff";

const classifier = withCache(createDefaultClassifier({}), {
  modelId: "claude-opus-4-8",
  promptVersion: "0",
});
```

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
- **Classify** the genuinely changed units with the LLM — modifications,
  insertions, and deletions alike (ADR-0011) — returning a structured,
  schema-validated verdict. Unchanged, trivially-changed, and relocated (moved)
  units never reach the model, which bounds cost and nondeterminism.
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
| [0010](adr/0010-move-detection-by-content-match.md) | Move detection by content match (deterministic, cosmetic) |
| [0011](adr/0011-classify-one-sided-changes.md) | Classify one-sided changes (insertions/deletions) through the model |
| [0012](adr/0012-classifier-resilience-timeout-and-retry.md) | Default classifier resilience: per-call timeout and bounded retry with backoff |

## License

[MIT](LICENSE) © 2026 Brian Benzinger
