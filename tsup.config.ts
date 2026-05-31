import { defineConfig } from "tsup";

/**
 * Build config for the publishable package (ADR-0002: one TypeScript source
 * tree, shipped as both a library and a CLI). esbuild resolves the explicit
 * `.ts` import specifiers the source uses (`allowImportingTsExtensions`) and
 * emits runnable ESM, while the rolled-up `.d.ts` collapses those internal
 * paths so consumers get a clean, single type entry point.
 *
 * The build tool is a devDependency only — the published runtime keeps ZERO
 * dependencies (ADR-0009). The CLI shebang in `src/cli.ts` is preserved by tsup.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  // Keep the published surface to what `exports`/`bin` reference; eval harness
  // and tests are development-only and excluded via the `files` allowlist.
});
