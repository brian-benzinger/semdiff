/**
 * Tests for the semdiff CLI (ADR-0002). `main` is driven directly with captured
 * stdout/stderr; inputs are chosen so no model call is needed (identical,
 * cosmetic, inserted, or deleted content), so the suite stays offline.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.ts";

let dir: string | undefined;

function twoFiles(a: string, b: string): [string, string] {
  dir = mkdtempSync(join(tmpdir(), "semdiff-cli-"));
  const fa = join(dir, "a.txt");
  const fb = join(dir, "b.txt");
  writeFileSync(fa, a);
  writeFileSync(fb, b);
  return [fa, fb];
}

function capture(stream: "stdout" | "stderr"): () => string {
  const chunks: string[] = [];
  vi.spyOn(process[stream], "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  return () => chunks.join("");
}

afterEach(() => {
  vi.restoreAllMocks();
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("semdiff CLI (ADR-0002)", () => {
  it("prints an empty structured diff for identical files", async () => {
    const [a, b] = twoFiles("Hello world. It applies.", "Hello world. It applies.");
    const out = capture("stdout");
    expect(await main([a, b])).toBe(0);
    const result = JSON.parse(out());
    expect(result.changes).toEqual([]);
    expect(typeof result.schemaVersion).toBe("string");
  });

  it("diffs a relocation as a move without needing the model", async () => {
    const [a, b] = twoFiles("Alpha one. Beta two.", "Beta two. Alpha one.");
    const out = capture("stdout");
    expect(await main([a, b])).toBe(0);
    expect(JSON.parse(out()).summary.byType.move).toBe(1);
  });

  it("passes --granularity clause through to the pipeline — change spans only the modified clause", async () => {
    // Using identical inputs would pass even if the flag were ignored; use inputs
    // where the two granularities produce different spans to verify the option
    // is actually forwarded. At clause granularity only "SECOND CLAUSE." (offset
    // 14) is a change; at sentence granularity the whole sentence (offset 0) is.
    const [a, b] = twoFiles("First clause; SECOND CLAUSE.", "First clause; second clause.");
    const out = capture("stdout");
    expect(await main([a, b, "--granularity", "clause"])).toBe(0);
    const result = JSON.parse(out());
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].classification).toBe("cosmetic");
    expect(result.changes[0].spanA.start).toBe(14); // second clause starts at offset 14
  });

  it("prints usage for --help and exits 0", async () => {
    const out = capture("stdout");
    expect(await main(["--help"])).toBe(0);
    expect(out()).toMatch(/Usage: semdiff/);
  });

  it("rejects the wrong number of arguments with exit 1", async () => {
    const err = capture("stderr");
    expect(await main(["only-one"])).toBe(1);
    expect(err()).toMatch(/Usage: semdiff/);
  });

  it("rejects an invalid granularity with exit 1", async () => {
    const err = capture("stderr");
    expect(await main(["a.txt", "b.txt", "--granularity", "paragraph"])).toBe(1);
    expect(err()).toMatch(/Usage/);
  });

  it("reports a read error and exits 1", async () => {
    const err = capture("stderr");
    expect(await main(["/no/such/semdiff-a", "/no/such/semdiff-b"])).toBe(1);
    expect(err()).toMatch(/cannot read/);
  });
});
