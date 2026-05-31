#!/usr/bin/env node
/**
 * `semdiff` CLI — a thin wrapper over the library (ADR-0002). It reads two
 * files, runs `diff`, and prints the `StructuredDiff` as JSON; the structured
 * diff is the source of truth (ADR-0006) and any rendering is a pure function of
 * it. No capability exists only in the CLI.
 *
 * Live diffs of substantive changes call the model, so set `ANTHROPIC_API_KEY`
 * (or inject a classifier from the library API). Identical, cosmetic, inserted,
 * or deleted content needs no model.
 *
 * NOTE (follow-up): wiring this `.ts` file as the package `bin` relies on Node
 * executing TypeScript; raw-`.ts` bin execution is not settled cross-platform
 * (notably Windows). Run via `node src/cli.ts ...` until that is resolved.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { diff, type DiffOptions } from "./index.ts";
import type { SegmentGranularity } from "./pipeline/segment.ts";

const USAGE = [
  "Usage: semdiff <fileA> <fileB> [--granularity sentence|clause]",
  "",
  "Prints a meaning-aware structured diff (JSON) of two text files.",
  "Substantive changes are classified by the model (set ANTHROPIC_API_KEY).",
].join("\n");

interface CliArgs {
  readonly fileA: string;
  readonly fileB: string;
  readonly granularity?: SegmentGranularity;
}

/** Parse argv into file paths plus options, or `null` if the arguments are invalid. */
function parseArgs(argv: readonly string[]): CliArgs | null {
  const positionals: string[] = [];
  let granularity: SegmentGranularity | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--granularity") {
      const value = argv[i + 1];
      if (value !== "sentence" && value !== "clause") return null;
      granularity = value;
      i += 1;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 2) return null;
  const fileA = positionals[0]!;
  const fileB = positionals[1]!;
  return granularity === undefined ? { fileA, fileB } : { fileA, fileB, granularity };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** CLI entry point. Returns the process exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const args = parseArgs(argv);
  if (args === null) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  let a: string;
  let b: string;
  try {
    [a, b] = await Promise.all([readFile(args.fileA, "utf8"), readFile(args.fileB, "utf8")]);
  } catch (error) {
    process.stderr.write(`semdiff: cannot read input: ${messageOf(error)}\n`);
    return 1;
  }

  try {
    const options: DiffOptions = args.granularity === undefined ? {} : { segmentGranularity: args.granularity };
    const result = await diff(a, b, options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`semdiff: ${messageOf(error)}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
