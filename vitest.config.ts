import { defineConfig } from "vitest/config";

/**
 * Test + coverage configuration (ADR-0008).
 *
 * The coverage gate is per-file, not a global average: every source file must
 * independently meet the thresholds. `all: true` reports files that no test
 * imported as 0%, so an untested module fails the gate rather than escaping it.
 * The CLI entrypoint is excluded — its top-level main-guard branch cannot be
 * exercised by a unit test.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts"],
      thresholds: {
        perFile: true,
        lines: 95,
        branches: 90,
      },
    },
  },
});
