/**
 * A small, domain-neutral labeled corpus for the classifier (ADR-0005). Each
 * case is one before/after pair with the expected classification. Kept generic
 * (commerce, terms of service, documentation) per ADR-0001 — no regulatory
 * vocabulary in the engine, even in fixtures.
 *
 * Beyond the clear-cut seed cases, it includes a batch of BOUNDARY cases whose
 * substantive/cosmetic call is subtle — designed to trip over-normalization
 * (a cosmetic edit flagged substantive) and under-detection (a substantive edit
 * missed, the costly error per ADR-0005), and to give the score discriminating
 * power. Labels are careful human judgements; a model disagreement is the signal
 * worth examining. ADR-0005's larger versioned corpus and optional consumer
 * domain packs build on this shape.
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

  // --- Boundary cases: cosmetic but LOOKS like a change (over-normalization risk) ---
  { name: "number formatting only", a: "The setup fee is $1,000.", b: "The setup fee is $1000.", expected: "cosmetic" },
  { name: "equivalent duration", a: "The trial lasts 12 months.", b: "The trial lasts one year.", expected: "cosmetic" },
  { name: "spelled-out count", a: "You have 3 login attempts.", b: "You have three login attempts.", expected: "cosmetic" },
  { name: "equivalent currency notation", a: "The price is USD 1,000.", b: "The price is $1,000.", expected: "cosmetic" },
  { name: "double negative simplified", a: "Outside food is not permitted.", b: "Outside food is prohibited.", expected: "cosmetic" },
  { name: "active to passive voice", a: "The customer must pay the fee.", b: "The fee must be paid by the customer.", expected: "cosmetic" },
  { name: "synonym, same threshold", a: "We require at least 30 days' notice.", b: "We require no fewer than 30 days' notice.", expected: "cosmetic" },

  // --- Boundary cases: substantive but LOOKS minor (missed-substance risk) ---
  { name: "permission to requirement", a: "Refunds may be requested within 30 days.", b: "Refunds must be requested within 30 days.", expected: "substantive" },
  { name: "recommendation to requirement", a: "Passwords should be rotated every 90 days.", b: "Passwords must be rotated every 90 days.", expected: "substantive" },
  { name: "timing inverted", a: "Payment is due within 30 days.", b: "Payment is due after 30 days.", expected: "substantive" },
  { name: "boundary now inclusive", a: "Discounts apply to orders over $100.", b: "Discounts apply to orders of $100 or more.", expected: "substantive" },
  { name: "small number change", a: "The setup fee is $1,000.", b: "The setup fee is $1,050.", expected: "substantive" },
  { name: "quantifier widened", a: "Some items are non-refundable.", b: "All items are non-refundable.", expected: "substantive" },
  { name: "and to or", a: "Bring your ID and your ticket.", b: "Bring your ID or your ticket.", expected: "substantive" },
  { name: "include to exclude", a: "Coverage includes accidental damage.", b: "Coverage excludes accidental damage.", expected: "substantive" },
  { name: "vague to specific deadline", a: "Report issues promptly.", b: "Report issues within 24 hours.", expected: "substantive" },

  // --- Boundary cases: one-sided and subtle ---
  { name: "insert: convenience disclaimer", type: "insertion", a: "", b: "This summary is provided for convenience only.", expected: "cosmetic" },
  { name: "delete: removed benefit", type: "deletion", a: "The first month is free.", b: "", expected: "substantive" },
];
