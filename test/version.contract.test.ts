/**
 * Guard against version drift between the package and the provenance stamp.
 *
 * `ENGINE_VERSION` is stamped into every `StructuredDiff` (ADR-0004) and must
 * equal the published `package.json` version, so a run's provenance always
 * names the artifact a consumer actually installed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../src/version.ts";

describe("version contract", () => {
  it("ENGINE_VERSION matches package.json version", () => {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
    expect(ENGINE_VERSION).toBe(pkg.version);
  });
});
