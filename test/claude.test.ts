/**
 * Tests for the default Anthropic-backed classifier (ADR-0009). Global `fetch`
 * is stubbed, so no real network calls are made. Covers key resolution, the
 * request shape (model, structured output, cache breakpoint), verdict parsing,
 * and the error paths that the classify stage degrades to needs-review.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createDefaultClassifier, SYSTEM_PROMPT } from "../src/classifiers/claude.ts";
import { DEFAULT_MODEL_ID, type CandidatePair } from "../src/classifier.ts";

const PAIR: CandidatePair = { type: "modification", a: "30%", b: "40%", spanA: { start: 0, end: 3 }, spanB: { start: 0, end: 3 } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A response whose content carries the verdict JSON, behind a non-text block. */
function verdictResponse(verdict: unknown): Response {
  return jsonResponse({ content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(verdict) }] });
}

/** Stub global fetch to return `response`, returning the typed mock for assertions. */
function stubFetch(response: Response) {
  const mock = vi.fn((_input: string | URL | Request, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function requestInit(mock: ReturnType<typeof stubFetch>): RequestInit {
  return mock.mock.calls[0]![1] as RequestInit;
}

function requestBody(mock: ReturnType<typeof stubFetch>): Record<string, any> {
  return JSON.parse(requestInit(mock).body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("createDefaultClassifier (ADR-0009)", () => {
  it("throws when no API key is available", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createDefaultClassifier({})).toThrow(/no API key/);
  });

  it("throws when the API key is an empty string", () => {
    expect(() => createDefaultClassifier({ apiKey: "" })).toThrow(/no API key/);
  });

  it("reads the API key from the environment", async () => {
    process.env.ANTHROPIC_API_KEY = "env-key";
    const mock = stubFetch(verdictResponse({ classification: "cosmetic", confidence: 0.9 }));
    const verdict = await createDefaultClassifier({}).classify(PAIR);
    expect(verdict.classification).toBe("cosmetic");
    const headers = requestInit(mock).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("env-key");
  });

  it("sends a constrained, cached request for the default model and maps the verdict", async () => {
    const mock = stubFetch(verdictResponse({ classification: "substantive", description: "value changed", confidence: 0.95 }));
    const verdict = await createDefaultClassifier({ apiKey: "k" }).classify(PAIR);
    expect(verdict).toEqual({ classification: "substantive", description: "value changed", confidence: 0.95 });
    expect(mock.mock.calls[0]![0]).toBe("https://api.anthropic.com/v1/messages");
    const body = requestBody(mock);
    expect(body.model).toBe(DEFAULT_MODEL_ID);
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.effort).toBe("low");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages[0].content).toContain("30%");
    expect(body.messages[0].content).toContain("40%");
  });

  it("honours an overridden model id", async () => {
    const mock = stubFetch(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    await createDefaultClassifier({ apiKey: "k", modelId: "claude-custom" }).classify(PAIR);
    expect(requestBody(mock).model).toBe("claude-custom");
  });

  it("includes effort for an effort-capable override (Sonnet 4.6)", async () => {
    const mock = stubFetch(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    await createDefaultClassifier({ apiKey: "k", modelId: "claude-sonnet-4-6" }).classify(PAIR);
    expect(requestBody(mock).output_config.effort).toBe("low");
  });

  it("omits effort for a model that rejects it (Haiku 4.5)", async () => {
    const mock = stubFetch(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    await createDefaultClassifier({ apiKey: "k", modelId: "claude-haiku-4-5" }).classify(PAIR);
    const body = requestBody(mock);
    expect(body.output_config.effort).toBeUndefined();
    expect(body.output_config.format.type).toBe("json_schema");
  });

  it("sends the full SYSTEM_PROMPT as the system message text", async () => {
    const mock = stubFetch(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    await createDefaultClassifier({ apiKey: "k" }).classify(PAIR);
    expect(requestBody(mock).system[0].text).toBe(SYSTEM_PROMPT);
  });

  it("sets max_tokens to 1024 in the request body", async () => {
    const mock = stubFetch(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    await createDefaultClassifier({ apiKey: "k" }).classify(PAIR);
    expect(requestBody(mock).max_tokens).toBe(1024);
  });

  it("formats the message content with pair type and both sides verbatim", async () => {
    const mock = stubFetch(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    await createDefaultClassifier({ apiKey: "k" }).classify(PAIR);
    expect(requestBody(mock).messages[0].content).toBe("Change type: modification.\nA:\n30%\n\nB:\n40%");
  });

  it("uses the correct pair type in the message content for insertions", async () => {
    const insertionPair: CandidatePair = {
      type: "insertion", a: "", b: "new obligation",
      spanA: null, spanB: { start: 0, end: 14 },
    };
    const mock = stubFetch(verdictResponse({ classification: "substantive", confidence: 0.9 }));
    await createDefaultClassifier({ apiKey: "k" }).classify(insertionPair);
    expect(requestBody(mock).messages[0].content).toBe("Change type: insertion.\nA:\n\n\nB:\nnew obligation");
  });

  it("sends the required anthropic-version header", async () => {
    const mock = stubFetch(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    await createDefaultClassifier({ apiKey: "k" }).classify(PAIR);
    const headers = requestInit(mock).headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("throws on a non-ok HTTP status (retries disabled)", async () => {
    stubFetch(new Response("", { status: 500 }));
    await expect(createDefaultClassifier({ apiKey: "k", maxRetries: 0 }).classify(PAIR)).rejects.toThrow(/Anthropic API error 500/);
  });

  it("surfaces the response body in a non-ok error (diagnosable 400s)", async () => {
    stubFetch(new Response("effort: unsupported parameter", { status: 400 }));
    await expect(createDefaultClassifier({ apiKey: "k" }).classify(PAIR)).rejects.toThrow(/400: effort: unsupported parameter/);
  });

  it("throws when the response has no content field", async () => {
    stubFetch(jsonResponse({}));
    await expect(createDefaultClassifier({ apiKey: "k" }).classify(PAIR)).rejects.toThrow(/no text content/);
  });

  it("throws when the response carries no text block", async () => {
    stubFetch(jsonResponse({ content: [{ type: "image" }] }));
    await expect(createDefaultClassifier({ apiKey: "k" }).classify(PAIR)).rejects.toThrow(/no text content/);
  });

  it("throws when the content array is empty", async () => {
    stubFetch(jsonResponse({ content: [] }));
    await expect(createDefaultClassifier({ apiKey: "k" }).classify(PAIR)).rejects.toThrow(/no text content/);
  });

  it("throws when the verdict text is not valid JSON", async () => {
    stubFetch(jsonResponse({ content: [{ type: "text", text: "not json" }] }));
    await expect(createDefaultClassifier({ apiKey: "k" }).classify(PAIR)).rejects.toThrow();
  });
});

describe("resilience: timeout and bounded retry (ADR-0012)", () => {
  it("retries a 429 with backoff, then succeeds", async () => {
    vi.useFakeTimers();
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(verdictResponse({ classification: "substantive", confidence: 0.9 }));
    vi.stubGlobal("fetch", mock);
    const promise = createDefaultClassifier({ apiKey: "k" }).classify(PAIR);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toMatchObject({ classification: "substantive" });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("retries a network error, then succeeds", async () => {
    vi.useFakeTimers();
    const mock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    vi.stubGlobal("fetch", mock);
    const promise = createDefaultClassifier({ apiKey: "k" }).classify(PAIR);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toMatchObject({ classification: "cosmetic" });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("waits out the Retry-After header instead of the default backoff", async () => {
    vi.useFakeTimers();
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(verdictResponse({ classification: "cosmetic", confidence: 1 }));
    vi.stubGlobal("fetch", mock);
    const promise = createDefaultClassifier({ apiKey: "k" }).classify(PAIR);
    await vi.advanceTimersByTimeAsync(1500);
    expect(mock).toHaveBeenCalledTimes(1); // still holding for the 2s server hint
    await vi.advanceTimersByTimeAsync(600);
    await expect(promise).resolves.toMatchObject({ classification: "cosmetic" });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("aborts a hung request after the timeout and retries", async () => {
    vi.useFakeTimers();
    const mock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string | URL | Request, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      )
      .mockResolvedValueOnce(verdictResponse({ classification: "substantive", confidence: 0.8 }));
    vi.stubGlobal("fetch", mock);
    const promise = createDefaultClassifier({ apiKey: "k", timeoutMs: 1000 }).classify(PAIR);
    await vi.advanceTimersByTimeAsync(1000); // fire the timeout → abort the first attempt
    await vi.advanceTimersByTimeAsync(2000); // wait out the backoff → retry
    await expect(promise).resolves.toMatchObject({ classification: "substantive" });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries and throws the last transient error", async () => {
    vi.useFakeTimers();
    const mock = vi.fn(() => Promise.resolve(new Response("overloaded", { status: 529 })));
    vi.stubGlobal("fetch", mock);
    const result = createDefaultClassifier({ apiKey: "k", maxRetries: 2 })
      .classify(PAIR)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await result;
    expect((error as Error).message).toMatch(/Anthropic API error 529/);
    expect(mock).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it("does not retry a client error (400)", async () => {
    const mock = stubFetch(new Response("bad request", { status: 400 }));
    await expect(createDefaultClassifier({ apiKey: "k" }).classify(PAIR)).rejects.toThrow(/Anthropic API error 400/);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
