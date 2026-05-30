# 0007. Spans are half-open character offsets into the literal input

- **Status:** Accepted
- **Date:** 2026-05-30

## Context

[0006](0006-structured-diff-output-schema.md) made the structured diff the
public contract but deliberately left one point open: it located each change
with "spans (offsets / unit ids in version A and version B)" and noted in its
own consequences that *"span semantics must be defined precisely (offsets vs
unit ids, behavior under moves) and held stable; ambiguity here propagates
straight into the consumer's citation accuracy."* That ambiguity is now the
last thing standing between the schema and a consumable contract.

The downstream consumer has since resolved the question in its own committed
code. In `sust-reg-reporter` (commit `4f7cf9e`), `core/src/citation.ts` defines:

```ts
/** Character offsets of the exact span within the snapshot, if known. */
readonly span?: { readonly start: number; readonly end: number };
```

That is, **character offsets**, resolving against an **immutable, content-
addressed snapshot** (its ADR-0004 *citation integrity*, ADR-0011 *content-
addressed snapshot store*). For semdiff's spans to be consumable with zero
translation — and for the consumer's citations to stay accurate — semdiff must
commit to the same basis and pin it stably. This ADR resolves the open point in
0006; it does not reverse a decision, so 0006 remains Accepted.

Doing so stays within [0001](0001-standalone-domain-neutral-engine.md): a span
is a generic offset pair, not a citation. The engine never learns what a
citation is; the consumer maps spans onto its own `SourceCitation`.

## Decision

A `Span` is a pair of **half-open `[start, end)` character offsets** locating a
change within **one** input.

1. **Character offsets, half-open.** `start` is inclusive, `end` exclusive, so
   `input.slice(start, end)` yields the spanned text and adjacent spans share a
   boundary without overlap. This matches the consumer's `{ start, end }`
   field-for-field.
2. **Offsets index the literal, un-normalized input.** They are offsets into
   the exact input string the caller passed — for the consumer, the stored
   snapshot text. Normalization the engine performs internally for alignment
   (whitespace, casing, punctuation, numbering) is for *matching only* and
   **must not shift reported offsets**. This is the load-bearing invariant; a
   regression here silently corrupts the consumer's citation accuracy.
3. **Two spans per change.** A `Change` carries `spanA` (into input A) and
   `spanB` (into input B). The absent side is `null` for a pure insertion
   (`spanA: null`) or pure deletion (`spanB: null`). Under `move`, both spans
   are present.
4. **`unitId` is additive metadata.** Segmentation may attach an optional unit
   id, but consumers anchor on `start`/`end`. Populating `unitId` later is an
   additive change (no `SCHEMA_VERSION` bump).
5. **Consumer guidance.** When mapping a change to a single citation, cite
   `spanB` for the current/new snapshot (modifications and insertions) and
   `spanA` for the prior snapshot (deletions).
6. **Provenance is the model-run stamp, not source provenance.** semdiff's
   `Provenance` (`modelId`, `promptVersion`, `engineVersion`) identifies the
   run that produced the diff. It is distinct from the consumer's source-version
   provenance (`snapshotHash`, `retrievedAt`); the two must not be conflated.

## Consequences

**Easier**
- The consumer lifts `spanA`/`spanB` `{ start, end }` straight onto its citation
  span with no translation layer, and attaches its own domain fields
  (`label`, `snapshotHash`, `retrievedAt`) itself.
- `input.slice(start, end)` is the single, testable definition of what a span
  means, which the eval/golden fixtures can assert directly (ADR-0005).
- Nullable `spanA`/`spanB` plus optional `unitId` keep later move-handling and
  unit-id population additive.

**Harder**
- Every stage that touches text must preserve raw-input offsets end to end. The
  segment stage records offsets into the literal input, and align/classify must
  carry them unchanged through any normalization — a discipline the
  implementation has to hold and tests have to guard.
- Half-open, character-based offsets assume a stable character-index basis
  (e.g. UTF-16 code units in JS strings); inputs must be compared on the same
  basis the offsets are measured in.

## Alternatives considered

- **Unit ids as the primary locator.** Rejected: the consumer already encodes
  character offsets against content-addressed snapshots, so unit ids would force
  a translation step and a shared unit-identity scheme across the repo boundary.
  Kept as optional additive metadata instead.
- **Inclusive `[start, end]` offsets.** Rejected: half-open is the conventional
  basis, composes cleanly with `String.prototype.slice`, and lets adjacent spans
  abut without ambiguity.
- **Offsets into normalized text.** Rejected: normalization is internal to
  alignment; exposing normalized offsets would break the consumer's ability to
  resolve a span against the stored snapshot.

## Cross-repo note

This is **semdiff** ADR-0007. It is unrelated to **sust-reg-reporter**
ADR-0007 (*change detection via semdiff*), which it happens to share a number
with — the two repos number their ADRs independently. The coordinating
constraints on the consumer side are its ADR-0004 (citation integrity) and
ADR-0011 (content-addressed snapshot store), realized in `core/src/citation.ts`
at commit `4f7cf9e`.
