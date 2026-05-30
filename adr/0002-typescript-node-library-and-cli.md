# 0002. TypeScript / Node, distributed as a library and a CLI

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

`semdiff` must be usable in two modes:

1. **As a library** embedded in the downstream application's change-detection
   path. In the planned architecture that path is an AWS **Lambda (differ)** that
   runs `semdiff` only when a source's content hash changes.
2. **As a CLI** that a developer can point at two files and get a meaning-aware
   diff, with no application involved — this is what makes the tool independently
   adoptable per [0001](0001-standalone-domain-neutral-engine.md).

Surrounding facts that bear on the runtime choice:

- The consuming application is an internal monorepo with `ingest`, `api`, and
  `web` workspaces — a JavaScript/TypeScript shape.
- Its infrastructure-as-code is AWS **CDK**, whose first-class language is
  TypeScript.
- The differ runs on Lambda, where the Node runtime is a first-class, fast
  cold-start target and where bundling a single artifact is straightforward.
- The broadest "I just want a semantic-diff CLI" audience installs via `npm`/
  `npx`, which lowers the adoption barrier the engine is designed to clear.

The main credible alternative is **Python**, which has a richer NLP ecosystem
(spaCy, NLTK) and is the default for ML-adjacent work.

## Decision

Implement `semdiff` in **TypeScript** targeting the **Node.js** runtime, and
publish a single package that exposes **both** a programmatic library API and a
`semdiff` CLI binary.

- The library is the source of truth; the CLI is a thin wrapper over it. No
  capability exists only in the CLI.
- Ship strict type definitions as part of the public contract.
- Keep the LLM provider behind an interface so it is injected, not hardwired
  (this also keeps the package usable in environments that supply their own
  client). See [0004](0004-llm-classification-and-deterministic-gating.md).
- Target a recent LTS Node so the same artifact runs locally and on Lambda
  without a separate build path.

## Consequences

**Easier**
- One language across the engine, the application's workspaces, and the CDK
  infrastructure: shared tooling, shared types, no FFI or subprocess boundary
  between the differ Lambda and the engine.
- `npx semdiff` is a frictionless entry point for external adopters.
- Single-artifact bundling fits the Lambda deployment model cleanly.

**Harder**
- We forgo Python's mature linguistic-segmentation libraries and must either find
  Node equivalents or implement segmentation deliberately
  (see [0003](0003-meaning-aware-diff-pipeline.md)). We accept this; segmentation
  quality is a design problem we want to own explicitly rather than inherit.
- TypeScript's ML/NLP ecosystem is thinner, but the heavy semantic lifting is
  delegated to the LLM, so the local code is mostly text wrangling, alignment,
  and orchestration — well within Node's strengths.

## Alternatives considered

- **Python.** Rejected for this project despite a stronger NLP ecosystem: it
  would introduce a second language into an otherwise TypeScript/CDK stack,
  add a process or packaging boundary at the differ Lambda, and raise friction
  for the JS-centric adopter the CLI targets. The semantic work lives in the
  LLM, not in local NLP libraries, which blunts Python's main advantage.
- **A compiled binary (Rust/Go).** Rejected: fast and dependency-light, but it
  fragments distribution (per-platform binaries), complicates `npx`-style
  adoption, and adds a language boundary to a codebase whose hard part is LLM
  orchestration, not raw throughput. Performance is a non-issue at the expected
  document sizes.
