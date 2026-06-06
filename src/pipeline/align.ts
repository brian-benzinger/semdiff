/**
 * Stage 2 — align (ADR-0003). Local and deterministic; no LLM.
 *
 * Match units across A and B and tag each pairing so the stage 2 -> 3 gate can
 * keep unchanged and cosmetic content away from the model:
 *
 *   - `unchanged`      — paired and textually identical.
 *   - `trivial-change` — paired after normalization (whitespace, casing,
 *                        punctuation, and leading enumeration collapsed) but the
 *                        literal text differs. A cosmetic edit.
 *   - `move`           — a relocation of identical content (ADR-0010): a deletion
 *                        whose normalized content matches an insertion elsewhere,
 *                        re-paired into one change. Both old (`a`) and new (`b`)
 *                        positions are present; the text is unchanged.
 *   - `candidate`      — a genuine change needing downstream judgment: a paired
 *                        modification (both sides present), or a one-sided
 *                        insertion (`a === null`) or deletion (`b === null`).
 *
 * Pairing runs a longest-common-subsequence match over the normalized keys, then
 * pairs the survivors in each gap positionally when they share a token. A final
 * pass re-pairs content-identical deletion/insertion survivors into `move`s.
 *
 * Normalization is used ONLY to decide matches; it never touches the `Unit`
 * offsets, so the literal-input invariant (ADR-0007) is preserved untouched.
 */
import type { Unit } from "./segment.ts";

/** How an aligned pairing relates its A and B units. */
export type AlignmentTag = "unchanged" | "trivial-change" | "move" | "candidate";

/** A pairing of units across inputs; either side may be `null`. */
export interface AlignedPair {
  readonly tag: AlignmentTag;
  /** Unit from A, or `null` for an insertion. */
  readonly a: Unit | null;
  /** Unit from B, or `null` for a deletion. */
  readonly b: Unit | null;
}

/** Leading list/enumeration marker, e.g. "1.", "1)", "(a)", "iv.", or a bullet. */
const LEADING_ENUMERATOR = /^\s*(?:[([]?\s*(?:\d{1,3}|[a-z]{1,2}|[ivxlcdm]{1,5})\s*[)\].]|[-*•·])\s+/iu;

/**
 * Unicode punctuation — quotes, dashes, periods, commas, parentheses, etc.
 * Symbols are deliberately KEPT: collapsing e.g. "<" and ">" (or "=" / "+")
 * would mask a substantive change as cosmetic, and missing substance is the
 * costly error (ADR-0005).
 */
const PUNCTUATION = /\p{P}/gu;

/**
 * Align the segmented units of A and B into tagged pairings, in order.
 * Deterministic; no model.
 */
export function align(unitsA: readonly Unit[], unitsB: readonly Unit[]): readonly AlignedPair[] {
  const keysA = unitsA.map(normalize);
  const keysB = unitsB.map(normalize);
  const matches = lcsMatches(keysA, keysB);

  const out: AlignedPair[] = [];
  let i = 0;
  let j = 0;
  for (const [mi, mj] of matches) {
    emitGap(unitsA.slice(i, mi), unitsB.slice(j, mj), out);
    const a = unitsA[mi]!;
    const b = unitsB[mj]!;
    out.push({ tag: a.text === b.text ? "unchanged" : "trivial-change", a, b });
    i = mi + 1;
    j = mj + 1;
  }
  emitGap(unitsA.slice(i), unitsB.slice(j), out);
  return detectMoves(out);
}

/**
 * Pair the survivors in a gap: positionally, as a `candidate` modification when
 * the two units share a token, otherwise as a separate deletion and insertion.
 * Any leftover units are one-sided deletions (A) or insertions (B).
 */
function emitGap(gapA: readonly Unit[], gapB: readonly Unit[], out: AlignedPair[]): void {
  const paired = Math.min(gapA.length, gapB.length);
  let k = 0;
  for (; k < paired; k++) {
    const a = gapA[k]!;
    const b = gapB[k]!;
    if (sharesToken(a, b)) {
      out.push({ tag: "candidate", a, b });
    } else {
      out.push({ tag: "candidate", a, b: null });
      out.push({ tag: "candidate", a: null, b });
    }
  }
  for (; k < gapA.length; k++) out.push({ tag: "candidate", a: gapA[k]!, b: null });
  for (; k < gapB.length; k++) out.push({ tag: "candidate", a: null, b: gapB[k]! });
}

/**
 * Re-pair content-identical deletion/insertion survivors into `move`s (ADR-0010).
 * A deletion is matched to an insertion with the same normalized key; the move
 * keeps the deletion's old position (`a`) and the insertion's new position (`b`).
 * Unmatched insertions/deletions are left as-is.
 *
 * Matching is content-only and 1:1 — it weighs neither distance nor document
 * structure (ADR-0010). Two consequences follow from keying on normalized text:
 * when several insertions share a key the LAST one wins (the map overwrites), and
 * if the same text genuinely appears as an unrelated deletion AND insertion they
 * collapse into one `move`. Acceptable at sentence/clause granularity, where
 * identical-content survivors are overwhelmingly true relocations.
 */
function detectMoves(pairs: readonly AlignedPair[]): readonly AlignedPair[] {
  const insertionByKey = new Map<string, number>();
  pairs.forEach((pair, index) => {
    if (pair.tag === "candidate" && pair.a === null) {
      insertionByKey.set(normalize(pair.b!), index);
    }
  });

  const moveTo = new Map<number, number>();
  pairs.forEach((pair, index) => {
    if (pair.tag === "candidate" && pair.b === null) {
      const key = normalize(pair.a!);
      const insertionIndex = insertionByKey.get(key);
      if (insertionIndex !== undefined) {
        insertionByKey.delete(key);
        moveTo.set(index, insertionIndex);
      }
    }
  });

  if (moveTo.size === 0) return pairs;

  const movedInsertions = new Set(moveTo.values());
  return pairs.flatMap((pair, index) => {
    if (movedInsertions.has(index)) return [];
    const insertionIndex = moveTo.get(index);
    return insertionIndex === undefined ? [pair] : [{ tag: "move" as const, a: pair.a, b: pairs[insertionIndex]!.b }];
  });
}

/** Normalized match key: lower-cased, enumerator-stripped, punctuation-free. */
function normalize(unit: Unit): string {
  return unit.text
    .toLowerCase()
    .replace(LEADING_ENUMERATOR, "")
    .replace(PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether two units share at least one normalized token (a weak similarity gate). */
function sharesToken(a: Unit, b: Unit): boolean {
  const tokensB = new Set(tokenize(b));
  return tokenize(a).some((token) => tokensB.has(token));
}

function tokenize(unit: Unit): string[] {
  const normalized = normalize(unit);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Longest-common-subsequence match over two key sequences, returned as ordered
 * `[indexInA, indexInB]` pairs of equal keys.
 *
 * Implemented with Hirschberg's divide-and-conquer LCS: O(n*m) time but only
 * O(min-of-the-two-lengths) space. The earlier version materialized the full
 * `(n+1) x (m+1)` length matrix, which is O(n*m) space and exhausts memory on
 * large inputs — two ~800 KB documents segment into tens of thousands of units,
 * so the matrix reaches hundreds of millions of cells (multiple GB) regardless
 * of how small the actual change is. This keeps two rolling rows instead, so a
 * large diff stays in tens of MB. The LCS it returns is identical for the
 * common unambiguous case (the golden align fixtures are unchanged).
 */
function lcsMatches(a: readonly string[], b: readonly string[]): Array<readonly [number, number]> {
  const matches: Array<readonly [number, number]> = [];
  hirschberg(a, 0, a.length, b, 0, b.length, matches);
  return matches;
}

/** Append, in order, the matched absolute-index pairs for `a[a0:a1]`/`b[b0:b1]`. */
function hirschberg(
  a: readonly string[],
  a0: number,
  a1: number,
  b: readonly string[],
  b0: number,
  b1: number,
  out: Array<readonly [number, number]>,
): void {
  const n = a1 - a0;
  const m = b1 - b0;
  if (n === 0 || m === 0) return;
  if (n === 1) {
    const key = a[a0]!;
    for (let j = b0; j < b1; j++) {
      if (b[j] === key) {
        out.push([a0, j]);
        return;
      }
    }
    return;
  }

  const aMid = a0 + (n >> 1);
  // scoreL[k] = LCS(a[a0:aMid], b[b0:b0+k]); scoreR[k] = LCS(a[aMid:a1], b[b0+k:b1]).
  const scoreL = lcsRowForward(a, a0, aMid, b, b0, b1);
  const scoreR = lcsRowBackward(a, aMid, a1, b, b0, b1);
  // Split B where the two halves' LCS lengths sum highest (first max keeps the
  // result deterministic and left-biased, matching the prior forward walk).
  let best = -1;
  let split = 0;
  for (let k = 0; k <= m; k++) {
    const total = scoreL[k]! + scoreR[k]!;
    if (total > best) {
      best = total;
      split = k;
    }
  }

  hirschberg(a, a0, aMid, b, b0, b0 + split, out);
  hirschberg(a, aMid, a1, b, b0 + split, b1, out);
}

/** Forward LCS lengths: returns row where row[k] = LCS(a[a0:a1], b[b0:b0+k]). */
function lcsRowForward(
  a: readonly string[],
  a0: number,
  a1: number,
  b: readonly string[],
  b0: number,
  b1: number,
): number[] {
  const width = b1 - b0;
  let prev = new Array<number>(width + 1).fill(0);
  let curr = new Array<number>(width + 1).fill(0);
  for (let i = a0; i < a1; i++) {
    for (let k = 1; k <= width; k++) {
      curr[k] =
        a[i] === b[b0 + k - 1] ? prev[k - 1]! + 1 : Math.max(prev[k]!, curr[k - 1]!);
    }
    [prev, curr] = [curr, prev];
  }
  return prev;
}

/** Backward LCS lengths: returns row where row[k] = LCS(a[a0:a1], b[b0+k:b1]). */
function lcsRowBackward(
  a: readonly string[],
  a0: number,
  a1: number,
  b: readonly string[],
  b0: number,
  b1: number,
): number[] {
  const width = b1 - b0;
  let prev = new Array<number>(width + 1).fill(0);
  let curr = new Array<number>(width + 1).fill(0);
  for (let i = a1 - 1; i >= a0; i--) {
    for (let k = width - 1; k >= 0; k--) {
      curr[k] = a[i] === b[b0 + k] ? prev[k + 1]! + 1 : Math.max(prev[k]!, curr[k + 1]!);
    }
    [prev, curr] = [curr, prev];
  }
  return prev;
}
