/**
 * Live smoke test for the engine + default classifier (ADR-0009).
 *
 * Makes ONE real Anthropic API call (a single substantive modification). Run it
 * with your key set in your own shell so the key never leaves your machine:
 *
 *   bash / git-bash:   ANTHROPIC_API_KEY=sk-... node examples/demo.ts
 *   PowerShell:        $env:ANTHROPIC_API_KEY="sk-..."; node examples/demo.ts
 *
 * With no key, createDefaultClassifier throws a clear error (no call is made).
 */
import { diff } from "../src/index.ts";

const before = "Companies with over $1 billion in annual revenue must report by 2026.";
const after = "Companies with over $500 million in annual revenue must report by 2027.";

const result = await diff(before, after);
console.log(JSON.stringify(result, null, 2));
