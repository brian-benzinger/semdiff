/**
 * Contract test for the StructuredDiff schema (ADR-0006). Pins the golden
 * example to the frozen shape so a consumer (e.g. `sust-reg-reporter`) can rely
 * on it. Deterministic; no model.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION } from "../src/schema.ts";
import type { ChangeType, StructuredDiff } from "../src/schema.ts";

const example = JSON.parse(
  readFileSync(fileURLToPath(new URL("./schema.example.json", import.meta.url)), "utf8"),
) as StructuredDiff;

describe("StructuredDiff contract (ADR-0006)", () => {
  it("the golden example declares the current schema version", () => {
    expect(example.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("summary.byType carries all four change types (zeros allowed)", () => {
    const expected: ChangeType[] = ["deletion", "insertion", "modification", "move"];
    expect(Object.keys(example.summary.byType).sort()).toEqual(expected);
  });

  it("a substantive modification carries a description", () => {
    for (const change of example.changes) {
      if (change.type === "modification" && change.classification === "substantive") {
        expect(typeof change.description).toBe("string");
      }
    }
  });

  it("a pure insertion has no A-side span; a pure deletion has no B-side span", () => {
    for (const change of example.changes) {
      if (change.type === "insertion") expect(change.spanA).toBeNull();
      if (change.type === "deletion") expect(change.spanB).toBeNull();
    }
  });

  it("summary counts agree with the change list", () => {
    const substantive = example.changes.filter((c) => c.classification === "substantive").length;
    const cosmetic = example.changes.filter((c) => c.classification === "cosmetic").length;
    const needsReview = example.changes.filter((c) => c.needsReview).length;
    expect(example.summary.substantive).toBe(substantive);
    expect(example.summary.cosmetic).toBe(cosmetic);
    expect(example.summary.needsReview).toBe(needsReview);
  });
});
