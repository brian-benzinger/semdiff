/**
 * Public-surface smoke test (skeleton phase).
 *
 * Two jobs:
 *  1. Assert every public export exists and, until implemented, surfaces a
 *     clear "not implemented" error rather than failing silently or returning
 *     a bogus result.
 *  2. Exercise every still-stubbed module so the per-file coverage gate
 *     (ADR-0008, 95% line / 90% branch, `all: true`) is satisfied. Because
 *     `all: true` reports unimported modules as 0%, each stub must be reached
 *     here or the gate fails — which is the point.
 *
 * As each stub is implemented it graduates to its own behavioral tests and is
 * dropped from here (e.g. `segment` → `segment.test.ts`). The CLI entrypoint
 * (`src/cli.ts`) is intentionally not imported and is excluded from coverage.
 */
import { describe, it, expect } from "vitest";

import { SCHEMA_VERSION } from "../src/schema.ts";
import { ENGINE_VERSION, DEFAULT_PROMPT_VERSION } from "../src/version.ts";
import { createDefaultClassifier } from "../src/classifier.ts";

describe("public surface (skeleton)", () => {
  it("exposes the version and contract constants", () => {
    expect(typeof SCHEMA_VERSION).toBe("string");
    expect(typeof ENGINE_VERSION).toBe("string");
    expect(typeof DEFAULT_PROMPT_VERSION).toBe("string");
  });

  it("createDefaultClassifier is not implemented yet", () => {
    expect(() => createDefaultClassifier({})).toThrow(/not implemented/);
  });
});
