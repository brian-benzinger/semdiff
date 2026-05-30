/**
 * Public-surface smoke test (skeleton phase).
 *
 * Two jobs:
 *  1. Assert every public export exists and, until implemented, surfaces a
 *     clear "not implemented" error rather than failing silently or returning
 *     a bogus result.
 *  2. Exercise every source module so the per-file coverage gate (ADR-0008,
 *     95% line / 90% branch, `all: true`) is satisfied. Because `all: true`
 *     reports unimported modules as 0%, each stub must be reached here or the
 *     gate fails — which is the point.
 *
 * As each stub is implemented, its "not implemented" assertion here will start
 * to fail; replace it with real behavioral tests at that point. The CLI
 * entrypoint (`src/cli.ts`) is intentionally not imported and is excluded from
 * coverage.
 */
import { describe, it, expect } from "vitest";

import { SCHEMA_VERSION } from "../src/schema.ts";
import { ENGINE_VERSION, DEFAULT_PROMPT_VERSION } from "../src/version.ts";
import { createDefaultClassifier, needsReviewVerdict, type Classifier } from "../src/classifier.ts";
import { diff } from "../src/index.ts";
import { segment } from "../src/pipeline/segment.ts";
import { align } from "../src/pipeline/align.ts";
import { classify } from "../src/pipeline/classify.ts";

describe("public surface (skeleton)", () => {
  it("exposes the version and contract constants", () => {
    expect(typeof SCHEMA_VERSION).toBe("string");
    expect(typeof ENGINE_VERSION).toBe("string");
    expect(typeof DEFAULT_PROMPT_VERSION).toBe("string");
  });

  it("createDefaultClassifier is not implemented yet", () => {
    expect(() => createDefaultClassifier({})).toThrow(/not implemented/);
  });

  it("needsReviewVerdict is not implemented yet", () => {
    expect(() => needsReviewVerdict("provider error")).toThrow(/not implemented/);
  });

  it("segment is not implemented yet", () => {
    expect(() => segment("some text", "sentence")).toThrow(/not implemented/);
  });

  it("align is not implemented yet", () => {
    expect(() => align([], [])).toThrow(/not implemented/);
  });

  it("diff rejects as not implemented yet", async () => {
    await expect(diff("a", "b")).rejects.toThrow(/not implemented/);
  });

  it("classify rejects as not implemented yet", async () => {
    const stubClassifier: Classifier = {
      classify: () => Promise.reject(new Error("unused: classify throws before calling the provider")),
    };
    await expect(classify([], stubClassifier)).rejects.toThrow(/not implemented/);
  });
});
