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
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Span, StructuredDiff } from "../src/schema.ts";

const example = JSON.parse(
  readFileSync(fileURLToPath(new URL("./schema.example.json", import.meta.url)), "utf8"),
) as StructuredDiff;

function assertHalfOpen(span: Span): void {
  assert.ok(Number.isInteger(span.start) && span.start >= 0, "start is a non-negative integer");
  assert.ok(Number.isInteger(span.end) && span.end >= span.start, "end >= start (half-open)");
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
        assert.notEqual(change.spanA, null);
        assert.notEqual(change.spanB, null);
      }
    }
  });

  // TODO(segment): once `segment` exists, build A and B from known units and
  // assert input.slice(span.start, span.end) === unit.text for every change,
  // proving offsets index the literal, un-normalized input (ADR-0007).
});
