#!/usr/bin/env node
/**
 * `semdiff` CLI — a thin wrapper over the library (ADR-0002). It reads two
 * files, calls `diff`, and prints the `StructuredDiff` as JSON; any human-
 * readable rendering is a pure function of that JSON (ADR-0006). No capability
 * exists only in the CLI.
 *
 * NOTE (unresolved, follow-up): wiring this `.ts` file as the package `bin`
 * relies on Node executing TypeScript via type-stripping. Shebang + raw-`.ts`
 * bin execution is not yet settled cross-platform (notably Windows, where
 * shebangs are ignored and npm uses shims). This stub does not commit to a bin
 * resolution mechanism; that is a separate decision.
 */
import { pathToFileURL } from "node:url";
import { diff } from "./index.ts";

/** CLI entry point. Skeleton: not yet implemented. */
export async function main(argv: readonly string[]): Promise<void> {
  // Intended flow: treat argv[0] and argv[1] as file paths, read them, call
  // `diff`, and print the resulting StructuredDiff as JSON.
  void argv;
  void diff;
  throw new Error("not implemented: semdiff CLI");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2));
}
