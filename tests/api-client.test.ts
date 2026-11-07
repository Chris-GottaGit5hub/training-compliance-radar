import { afterEach, describe, expect, it, vi } from "vitest";
import { describeApiError, postAi } from "@/lib/api/client";
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

  it("rejects a response that does not match the schema", async () => {
    stubFetch(Response.json({ unexpected: true }));
    expect(await postAi("/api/summary", {}, summaryResponseSchema)).toMatchObject({
      ok: false,
      status: 502,
    });
  });
});
