# 0008. Vitest with a per-file coverage gate

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

[0002](0002-typescript-node-library-and-cli.md) chose TypeScript / Node, and
[0005](0005-eval-harness-and-determinism-layer.md) makes the determinism and
quality layer the engine's actual contribution — coverage and eval rigor are
first-class, not afterthoughts. The skeleton initially used Node's built-in test
runner (`node --test`) to match the sibling `sust-reg-reporter` and stay
dependency-free.

Adding a coverage gate (target: 95% line, 90% branch) exposed `node --test` as
too weak for that goal:

- Its `--test-coverage-*` thresholds check the **global average** only. A single
  file well below target passes as long as the aggregate holds — measured: a
  stage at 88.89% line coverage passed because the average was 98.65%.
- It only measures files that were **loaded** during the run. An untested,
  unimported module is invisible to the gate rather than counted as 0%.

Those are precisely the regressions a coverage gate exists to catch.

## Decision

Use **Vitest** (with the **v8** coverage provider) as the test runner, and
enforce a **per-file** coverage gate in `vitest.config.ts`:

- `thresholds.perFile: true`, `lines: 95`, `branches: 90` — every source file
  must independently meet the bar; the failing file is named.
- `all: true` with `include: ['src/**/*.ts']` — modules no test imported are
  reported at 0% and fail, closing the "untested new file" gap.
- `exclude: ['src/cli.ts']` — the CLI entrypoint's top-level main-guard branch
  cannot be exercised by a unit test; it is integration territory.

Tests use Vitest's `describe` / `it` / `expect`. `npm test` runs
`vitest run --coverage` (CI and local identical); `npm run test:watch` is for
iteration.

This **refines, and does not supersede, [0002](0002-typescript-node-library-and-cli.md)**:
the engine is still TypeScript / Node and still ships `.ts` the consumer imports.
Vitest is a **dev/test-only** dependency — the shipped library stays node-native
with no build step and runs on Lambda unchanged.

## Consequences

**Easier**
- A real per-file gate: under-testing a single module fails CI and names it;
  unimported modules count as 0%.
- Better ergonomics for what is coming: `vi.fn` / `vi.mock` for the mocked
  `Classifier` ([0004](0004-llm-classification-and-deterministic-gating.md)),
  watch mode, and a richer assertion/diff surface that will serve the eval
  harness ([0005](0005-eval-harness-and-determinism-layer.md)).
- Coverage configuration lives in `vitest.config.ts` — no cross-platform
  shell-glob quoting in npm scripts.

**Harder**
- Adds dev-only dependencies (`vitest`, `@vitest/coverage-v8`) and an esbuild
  transform layer for tests, versus `node --test`'s zero-dependency "just run
  the `.ts`."
- Diverges from `sust-reg-reporter`, which uses `node --test`: two repos, two
  test stacks. Accepted because semdiff's quality layer is its product
  ([0005](0005-eval-harness-and-determinism-layer.md)); the shipped artifact is
  unaffected.

## Alternatives considered

- **Stay on `node --test`.** Rejected: global-average-only thresholds and no
  accounting for unimported files make the gate too weak for the 95/90 intent.
- **`c8` / `nyc` over `node --test`.** Rejected: `c8` can do per-file thresholds
  but adds a dependency and a separate runner/config pairing without Vitest's
  ergonomics or mocking — little advantage over committing to Vitest.
- **Jest.** Rejected: heavier, needs a TS transform (ts-jest/babel) anyway, and
  its ESM story is more friction than Vitest's native ESM/TypeScript support.
