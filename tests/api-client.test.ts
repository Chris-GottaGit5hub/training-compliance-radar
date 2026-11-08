import { afterEach, describe, expect, it, vi } from "vitest";
import { describeApiError, describeApiFailure, postAi } from "@/lib/api/client";
import { summaryResponseSchema } from "@/lib/schemas";

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (response: Response | Error) =>
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }));

describe("describeApiError", () => {
  it("has a distinct, helpful message for each route status", () => {
    const messages = [0, 400, 413, 429, 502, 503, 500].map(describeApiError);
    expect(new Set(messages).size).toBe(messages.length);
    expect(describeApiError(503)).toMatch(/not configured/i);
    expect(describeApiError(429)).toMatch(/wait/i);
  });
});

describe("describeApiFailure", () => {
  it("names the missing key and what to do about it", () => {
    const message = describeApiFailure(503, {
      error: "ai_not_configured",
      reason: "missing_key",
      keyVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    });
    expect(message).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(message).toMatch(/Vercel/);
    expect(message).toMatch(/redeploy/i);
  });

  it("explains an unknown provider", () => {
    expect(describeApiFailure(503, { reason: "unknown_provider" })).toContain("AI_PROVIDER");
  });

  it("turns provider error codes into hints", () => {
    expect(describeApiFailure(502, { code: "http_403" })).toMatch(/API key/);
    expect(describeApiFailure(502, { code: "http_404" })).toMatch(/model/);
    expect(describeApiFailure(502, { code: "http_429" })).toMatch(/quota/);
    expect(describeApiFailure(502, { code: "http_429_daily" })).toMatch(/daily/i);
    expect(describeApiFailure(502, { code: "weird" })).toContain("weird");
  });

  it("falls back to the generic message without a body", () => {
    expect(describeApiFailure(502)).toBe(describeApiError(502));
  });
});

describe("postAi", () => {
  it("returns validated data on success and sends JSON", async () => {
    stubFetch(Response.json({ summary: "All good." }));
    const result = await postAi("/api/summary", { a: 1 }, summaryResponseSchema);
    expect(result).toEqual({ ok: true, data: { summary: "All good." } });
    const [path, init] = vi.mocked(fetch).mock.calls[0];
    expect(path).toBe("/api/summary");
    expect(init).toMatchObject({ method: "POST", body: '{"a":1}' });
  });

  it("flags a 503 ai_not_configured so the UI can disable AI buttons", async () => {
    stubFetch(Response.json({ error: "ai_not_configured" }, { status: 503 }));
    expect(await postAi("/api/summary", {}, summaryResponseSchema)).toMatchObject({
      ok: false,
      status: 503,
      notConfigured: true,
    });
  });

  it("maps other failures to a message without marking AI as unconfigured", async () => {
    stubFetch(Response.json({ error: "rate_limited" }, { status: 429 }));
    const result = await postAi("/api/summary", {}, summaryResponseSchema);
    expect(result).toMatchObject({ ok: false, status: 429, notConfigured: false });
    expect(!result.ok && result.message).toMatch(/too many/i);
  });

  it("treats network errors as status 0", async () => {
    stubFetch(new TypeError("offline"));
    expect(await postAi("/api/summary", {}, summaryResponseSchema)).toMatchObject({
      ok: false,
      status: 0,
    });
  });

  it("includes the server's reason in the message for a 503", async () => {
    stubFetch(
      Response.json(
        { error: "ai_not_configured", reason: "missing_key", keyVar: "GOOGLE_GENERATIVE_AI_API_KEY" },
        { status: 503 },
      ),
    );
    const result = await postAi("/api/summary", {}, summaryResponseSchema);
    expect(!result.ok && result.message).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("gives up with a timeout error instead of loading forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_path: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
          ),
      ),
    );
    const result = await postAi("/api/summary", {}, summaryResponseSchema, { timeoutMs: 20 });
    expect(result).toMatchObject({ ok: false, status: 408 });
    expect(!result.ok && result.message).toMatch(/too long/i);
  });

  it("never throws, even if the response body is not JSON", async () => {
    stubFetch(new Response("<html>oops</html>", { status: 500 }));
    await expect(postAi("/api/summary", {}, summaryResponseSchema)).resolves.toMatchObject({
      ok: false,
      status: 500,
    });
  });

  it("rejects a response that does not match the schema", async () => {
    stubFetch(Response.json({ unexpected: true }));
    expect(await postAi("/api/summary", {}, summaryResponseSchema)).toMatchObject({
      ok: false,
      status: 502,
    });
  });
});
