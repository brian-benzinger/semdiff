#!/usr/bin/env node
/**
 * Eval runner (ADR-0005). Classifies each labeled corpus case with the default
 * classifier and prints precision/recall for substantive-change detection.
 *
 * This makes real model calls, so set ANTHROPIC_API_KEY:
 *   ANTHROPIC_API_KEY=sk-... node src/eval/run.ts
 *
 * Excluded from the coverage gate (it hits the network); the scorer and corpus
 * are unit-tested. A future version wires this into CI behind a key.
 */
import { createDefaultClassifier } from "../classifiers/claude.ts";
import type { CandidatePair } from "../classifier.ts";
import { CORPUS } from "./corpus.ts";
import { scoreEval, type ScoredCase } from "./score.ts";

async function runEval(): Promise<void> {
  const classifier = createDefaultClassifier({});
  const scored: ScoredCase[] = [];
  for (const testCase of CORPUS) {
    const pair: CandidatePair = {
      a: testCase.a,
      b: testCase.b,
      spanA: { start: 0, end: testCase.a.length },
      spanB: { start: 0, end: testCase.b.length },
    };
    const verdict = await classifier.classify(pair);
    scored.push({ expected: testCase.expected, predicted: verdict.classification, confidence: verdict.confidence });
    const mark = verdict.classification === testCase.expected ? "ok  " : "MISS";
    process.stdout.write(`${mark} ${testCase.name}: ${verdict.classification} (${verdict.confidence})\n`);
  }
  process.stdout.write(`\n${JSON.stringify(scoreEval(scored), null, 2)}\n`);
}

void runEval().catch((error: unknown) => {
  process.stderr.write(`eval failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
