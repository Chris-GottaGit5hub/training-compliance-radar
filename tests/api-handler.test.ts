import { describe, expect, it } from "vitest";
import { handleAiRequest } from "@/lib/api/handler";
import { clientIp, createRateLimiter } from "@/lib/api/rateLimit";
import { API_LIMITS, memoRequestSchema } from "@/lib/schemas";

describe("createRateLimiter", () => {
  it("allows 10 requests per minute and blocks the 11th (acceptance 9)", () => {
    const limiter = createRateLimiter({ now: () => 1_000 });
    const results = Array.from({ length: 11 }, () => limiter.check("1.2.3.4"));
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10]).toEqual({ allowed: false, retryAfterSec: 60 });
  });

  it("tracks each IP separately", () => {
    const limiter = createRateLimiter({ now: () => 0 });
    for (let i = 0; i < 10; i++) limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("frees capacity as the window slides", () => {
    let now = 0;
    const limiter = createRateLimiter({ now: () => now });
    for (let i = 0; i < 10; i++) {
      limiter.check("a");
      now += 1_000; // hits at 0..9 s
    }
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSec: 50 }); // oldest hit expires at 60 s
    now = 60_001; // first hit left the window
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("does not count blocked attempts against the caller", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });
    limiter.check("a");
    limiter.check("a");
    for (let i = 0; i < 5; i++) limiter.check("a"); // blocked
    now = 1_001;
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://x", { headers });
  it("uses the first x-forwarded-for address, then x-real-ip, then unknown", () => {
    expect(clientIp(req({ "x-forwarded-for": " 9.9.9.9 , 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientIp(req({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

const validMemo = {
  unit: "Finance",
  atRiskCount: 4,
  coveredCount: 20,
  deadline: "2026-12-31",
  monthsRemaining: 3,
  courses: [],
  tone: "formal",
};
const env = { GOOGLE_GENERATIVE_AI_API_KEY: "test-key" };
const okRun = async () => ({ ok: true as const, body: { subject: "S", body: "B" } });

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/memo", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "5.5.5.5", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("handleAiRequest guards", () => {
  const spec = { schema: memoRequestSchema, run: okRun };
  const deps = () => ({ env, limiter: createRateLimiter({ now: () => 0 }) });

  it("returns 200 with the run body for a valid request", async () => {
    const res = await handleAiRequest(post(validMemo), spec, deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subject: "S", body: "B" });
  });

  it("returns 429 with Retry-After on the 11th request from one IP (acceptance 9)", async () => {
    const shared = deps();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await handleAiRequest(post(validMemo), spec, shared)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    const blocked = await handleAiRequest(post(validMemo), spec, shared);
    expect(blocked.headers.get("Retry-After")).toBe("60");
  });

  it("returns 413 for an oversized body, before parsing it", async () => {
    const res = await handleAiRequest(post("x".repeat(API_LIMITS.maxBodyBytes + 1)), spec, deps());
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
  });

  it("returns 400 for invalid JSON and for invalid or extra fields", async () => {
    expect((await handleAiRequest(post("{not json"), spec, deps())).status).toBe(400);
    expect((await handleAiRequest(post({ ...validMemo, tone: "rude" }), spec, deps())).status).toBe(400);
    const extra = await handleAiRequest(post({ ...validMemo, employeeNames: ["Ana Cruz"] }), spec, deps());
    expect(extra.status).toBe(400);
  });

  it("never echoes submitted values in an error body", async () => {
    const res = await handleAiRequest(post({ ...validMemo, unit: "LEAK-ME", tone: "rude" }), spec, deps());
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("LEAK-ME");
  });

  it("returns 503 ai_not_configured when the provider key is missing (acceptance 12)", async () => {
    const res = await handleAiRequest(post(validMemo), spec, { ...deps(), env: {} });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_not_configured" });
  });

  it("returns 502 when the AI run fails or throws", async () => {
    const failing = { schema: memoRequestSchema, run: async () => ({ ok: false as const }) };
    const throwing = { schema: memoRequestSchema, run: async () => { throw new Error("boom SECRET"); } };
    expect((await handleAiRequest(post(validMemo), failing, deps())).status).toBe(502);
    const res = await handleAiRequest(post(validMemo), throwing, deps());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET");
  });
});
