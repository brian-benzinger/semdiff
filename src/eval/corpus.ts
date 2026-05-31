/**
 * A small, domain-neutral labeled corpus for the classifier (ADR-0005). Each
 * case is one before/after pair with the expected classification. Kept generic
 * (commerce, terms of service, documentation) per ADR-0001 — no regulatory
 * vocabulary in the engine, even in fixtures.
 *
 * This is a seed corpus, deliberately small. ADR-0005's larger versioned corpus
 * and optional consumer domain packs build on this shape.
 */
import type { Classification } from "../schema.ts";
import type { CandidateType } from "../classifier.ts";

export interface EvalCase {
  readonly name: string;
  /**
   * Structural kind of the change (ADR-0011). Defaults to `modification`. For an
   * `insertion` the `a` side is empty; for a `deletion` the `b` side is empty —
   * the runner builds the one-sided `CandidatePair` (empty side, null span)
   * accordingly.
   */
  readonly type?: CandidateType;
  readonly a: string;
  readonly b: string;
  readonly expected: Classification;
}

export const CORPUS: readonly EvalCase[] = [
  // Two-sided modifications.
  { name: "threshold raised", a: "Free shipping on orders over $50.", b: "Free shipping on orders over $100.", expected: "substantive" },
  { name: "deadline shortened", a: "Refunds are issued within 30 days.", b: "Refunds are issued within 14 days.", expected: "substantive" },
  { name: "negation added", a: "Guests may bring outside food.", b: "Guests may not bring outside food.", expected: "substantive" },
  { name: "scope narrowed", a: "All members get early access.", b: "Premium members get early access.", expected: "substantive" },
  { name: "casing only", a: "The Cap Is Fixed.", b: "the cap is fixed.", expected: "cosmetic" },
  { name: "punctuation only", a: "Save the file, then close it.", b: "Save the file; then close it.", expected: "cosmetic" },
  { name: "reworded, same meaning", a: "You must sign the form.", b: "Signing the form is required.", expected: "cosmetic" },
  { name: "renumbered clause", a: "(3) The limit is ten units.", b: "(4) The limit is ten units.", expected: "cosmetic" },
  // One-sided changes (ADR-0011): inserted/removed whole units, judged not assumed.
  { name: "insert: new obligation", type: "insertion", a: "", b: "Accounts must enable two-factor authentication to withdraw funds.", expected: "substantive" },
  { name: "insert: added exception", type: "insertion", a: "", b: "Orders placed on public holidays ship the next business day.", expected: "substantive" },
  { name: "insert: boilerplate closing", type: "insertion", a: "", b: "Thank you for choosing our service.", expected: "cosmetic" },
  { name: "delete: removed condition", type: "deletion", a: "Cancellations after 48 hours forfeit the deposit.", b: "", expected: "substantive" },
  { name: "delete: removed exemption", type: "deletion", a: "Nonprofit organizations are exempt from this fee.", b: "", expected: "substantive" },
  { name: "delete: boilerplate greeting", type: "deletion", a: "Welcome, and thanks for visiting.", b: "", expected: "cosmetic" },
];
