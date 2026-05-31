/**
 * Guard against version drift between the package and the provenance stamps.
 *
 * `ENGINE_VERSION` is stamped into every `StructuredDiff` (ADR-0004) and must
 * equal the published `package.json` version, so a run's provenance always names
 * the artifact a consumer actually installed.
 *
 * `DEFAULT_PROMPT_VERSION` is the cache/reproducibility contract (ADR-0005): the
 * verdict cache is keyed on the prompt *version*, not the prompt *text*, so a
 * changed prompt under an unchanged version serves stale cached verdicts. We pin
 * the prompt's hash to its version here — editing `SYSTEM_PROMPT` fails this test
 * until the version is bumped, which is the whole point.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, DEFAULT_PROMPT_VERSION } from "../src/version.ts";
import { SYSTEM_PROMPT } from "../src/classifiers/claude.ts";

/**
 * The SHA-256 each `DEFAULT_PROMPT_VERSION` promises. Editing `SYSTEM_PROMPT`
 * changes its hash and fails the test below: bump `DEFAULT_PROMPT_VERSION` and
 * ADD a new entry here. Do NOT overwrite an existing version's hash — a consumer
 * that persisted a verdict cache under that version would then be served stale
 * verdicts from a prompt it never saw (ADR-0005).
 */
const PROMPT_SHA256_BY_VERSION: Readonly<Record<string, string>> = {
  "0": "f6f3b70029196f8dcbbc2599fe8b85c3edc389a4cd8e7aa303b632b67e8f37bc",
};

describe("version contract", () => {
  it("ENGINE_VERSION matches package.json version", () => {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
    expect(ENGINE_VERSION).toBe(pkg.version);
  });

  it("SYSTEM_PROMPT matches the hash pinned for DEFAULT_PROMPT_VERSION (ADR-0005)", () => {
    const expected = PROMPT_SHA256_BY_VERSION[DEFAULT_PROMPT_VERSION];
    expect(expected, `no pinned prompt hash for version "${DEFAULT_PROMPT_VERSION}" — add one to PROMPT_SHA256_BY_VERSION`).toBeDefined();
    const actual = createHash("sha256").update(SYSTEM_PROMPT).digest("hex");
    expect(actual).toBe(expected);
  });
});
