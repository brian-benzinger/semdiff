/**
 * Scoring for the eval harness (ADR-0005). Pure and deterministic: given the
 * model's classification of each labeled case, compute precision/recall for
 * SUBSTANTIVE-change detection.
 *
 * Per ADR-0005 the two error types are tracked separately because their costs
 * differ: `missedSubstantive` (a substantive change called cosmetic — the
 * COSTLY error, ADR-0005) and `falseFlags` (a cosmetic change called
 * substantive — noise). Mean confidence on correct vs incorrect calls is a
 * coarse calibration signal.
 */
import type { Classification } from "../schema.ts";

/** One scored case: the expected label, the model's call, and its confidence. */
export interface ScoredCase {
  readonly expected: Classification;
  readonly predicted: Classification;
  readonly confidence: number;
}

export interface EvalReport {
  readonly total: number;
  readonly accuracy: number;
  /** Precision treating `substantive` as the positive class. */
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  /** Substantive changes the model called cosmetic — the costly error (ADR-0005). */
  readonly missedSubstantive: number;
  /** Cosmetic changes the model called substantive — noise. */
  readonly falseFlags: number;
  readonly meanConfidenceCorrect: number;
  readonly meanConfidenceIncorrect: number;
}

/** Score a set of classified cases. `substantive` is the positive class. */
export function scoreEval(cases: readonly ScoredCase[]): EvalReport {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let correctConfidence = 0;
  let correctCount = 0;
  let wrongConfidence = 0;
  let wrongCount = 0;

  for (const item of cases) {
    const predictedPositive = item.predicted === "substantive";
    const actualPositive = item.expected === "substantive";
    if (predictedPositive && actualPositive) truePositive += 1;
    else if (predictedPositive && !actualPositive) falsePositive += 1;
    else if (!predictedPositive && actualPositive) falseNegative += 1;
    else trueNegative += 1;

    if (item.predicted === item.expected) {
      correctConfidence += item.confidence;
      correctCount += 1;
    } else {
      wrongConfidence += item.confidence;
      wrongCount += 1;
    }
  }

  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);
  return {
    total: cases.length,
    accuracy: ratio(truePositive + trueNegative, cases.length),
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    missedSubstantive: falseNegative,
    falseFlags: falsePositive,
    meanConfidenceCorrect: ratio(correctConfidence, correctCount),
    meanConfidenceIncorrect: ratio(wrongConfidence, wrongCount),
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
