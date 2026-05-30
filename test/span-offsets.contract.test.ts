/**
 * Contract test for span offset semantics (ADR-0007).
 *
 * Spans are half-open `[start, end)` CHARACTER OFFSETS into the literal,
 * un-normalized input. The full end-to-end guarantee — that
 * `input.slice(span.start, span.end)` returns the unit text, proving offsets
 * index the literal input and are stable through alignment normalization — can
 * only be exercised once `segment` lands (see TODO below). Until then this pins
 * the structural invariant the contract commits to today.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Span, StructuredDiff } from "../src/schema.ts";

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

  // TODO(segment): once `segment` exists, build A and B from known units and
  // assert input.slice(span.start, span.end) === unit.text for every change,
  // proving offsets index the literal, un-normalized input (ADR-0007).
});
