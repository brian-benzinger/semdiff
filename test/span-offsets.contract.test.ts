/**
 * Contract test for span offset semantics (ADR-0007).
 *
 * Spans are half-open `[start, end)` CHARACTER OFFSETS into the literal,
 * un-normalized input. The full end-to-end guarantee — that
 * `input.slice(span.start, span.end)` returns the unit text, proving offsets
 * index the literal input and are stable through alignment normalization — is
 * exercised end-to-end in the second describe block below, which drives real
 * `segment` output through the full pipeline.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Span, StructuredDiff } from "../src/schema.ts";
import { diff } from "../src/index.ts";
import type { Classifier } from "../src/classifier.ts";

const example = JSON.parse(
  readFileSync(fileURLToPath(new URL("./schema.example.json", import.meta.url)), "utf8"),
) as StructuredDiff;

function assertHalfOpen(span: Span): void {
  expect(Number.isInteger(span.start) && span.start >= 0).toBe(true);
  expect(Number.isInteger(span.end) && span.end >= span.start).toBe(true);
}

describe("span offset semantics (ADR-0007)", () => {
  it("every present span is a valid half-open character range", () => {
    for (const change of example.changes) {
      if (change.spanA !== null) assertHalfOpen(change.spanA);
      if (change.spanB !== null) assertHalfOpen(change.spanB);
    }
  });

  it("a modification locates the change in both inputs", () => {
    for (const change of example.changes) {
      if (change.type === "modification") {
        expect(change.spanA).not.toBeNull();
        expect(change.spanB).not.toBeNull();
      }
    }
  });
});

describe("span offset semantics through the full pipeline (ADR-0007)", () => {
  // Mock classifier — no real API call needed for any test in this group.
  const substantive: Classifier = {
    classify: async () => ({ classification: "substantive", confidence: 0.9 }),
  };

  it("modification spans extract the exact changed sentence from both literal inputs", async () => {
    const a = "First unchanged. The cap is 30%.";
    const b = "First unchanged. The cap is 40%.";
    const { changes } = await diff(a, b, { classifier: substantive });
    const mod = changes.find((c) => c.type === "modification");
    expect(mod?.spanA).not.toBeNull();
    expect(mod?.spanB).not.toBeNull();
    expect(a.slice(mod!.spanA!.start, mod!.spanA!.end)).toBe("The cap is 30%.");
    expect(b.slice(mod!.spanB!.start, mod!.spanB!.end)).toBe("The cap is 40%.");
  });

  it("insertion span is null on the A side and extracts the new sentence from the literal B input", async () => {
    const a = "First. Third.";
    const b = "First. Second. Third.";
    const { changes } = await diff(a, b, { classifier: substantive });
    const ins = changes.find((c) => c.type === "insertion");
    expect(ins?.spanA).toBeNull();
    expect(b.slice(ins!.spanB!.start, ins!.spanB!.end)).toBe("Second.");
  });

  it("deletion span is null on the B side and extracts the removed sentence from the literal A input", async () => {
    const a = "First. Second. Third.";
    const b = "First. Third.";
    const { changes } = await diff(a, b, { classifier: substantive });
    const del = changes.find((c) => c.type === "deletion");
    expect(del?.spanB).toBeNull();
    expect(a.slice(del!.spanA!.start, del!.spanA!.end)).toBe("Second.");
  });

  it("move spans extract the same text from A at its old position and from B at its new position", async () => {
    const a = "Alpha one. Beta two.";
    const b = "Beta two. Alpha one.";
    const { changes } = await diff(a, b);
    const move = changes.find((c) => c.type === "move");
    expect(move?.spanA).not.toBeNull();
    expect(move?.spanB).not.toBeNull();
    const textA = a.slice(move!.spanA!.start, move!.spanA!.end);
    const textB = b.slice(move!.spanB!.start, move!.spanB!.end);
    // The moved sentence must be reproduced verbatim, not merely be non-empty.
    expect(textA).toBe("Alpha one.");
    expect(textB).toBe("Alpha one.");
  });
});
