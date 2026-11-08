import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { DEFAULT_MODELS, describeAiStatus, resolveAiConfig, type AiConfig } from "@/lib/ai/config";
import { errorCode, formatAiLog, type StructuredGenerator } from "@/lib/ai/generate";
import { extractNumbers, ungroundedNumbers } from "@/lib/ai/grounding";
import { runMemo, runRecommend, runSummary } from "@/lib/ai/run";
import type { MemoRequest, RecommendRequest, SummaryRequest } from "@/lib/schemas";

const aiConfig: AiConfig = { provider: "google", modelId: "gemini-3.8-flash", apiKey: "test-key" };

/** Fake generator that returns queued outputs (or a failure) and counts calls. */
function fakeGenerator(results: (unknown | "FAIL")[]) {
  let calls = 0;
  const generate = (async () => {
    const next = results[Math.min(calls++, results.length - 1)];
    return next === "FAIL" ? { ok: false, code: "unknown" } : { ok: true, output: next };
  }) as unknown as StructuredGenerator;
  return { generate, calls: () => calls };
}

const memoRequest: MemoRequest = {
  unit: "Finance",
  atRiskCount: 12,
  coveredCount: 85,
  deadline: "2026-12-31",
  monthsRemaining: 3,
  courses: [{ title: "Excel Essentials 2019", durationMinutes: 120 }],
  tone: "friendly",
};
const goodMemo = {
  subject: "{{AT_RISK_COUNT}} colleagues need training",
  body: "{{AT_RISK_COUNT}} of {{COVERED_COUNT}} staff must finish by {{DEADLINE}}, about 3 months away. Try Excel Essentials 2019 (2 hours).\n{{EMPLOYEE_LIST}}",
};

describe("resolveAiConfig", () => {
  it("defaults to google and gemini-3.8-flash (acceptance 11)", () => {
    const result = resolveAiConfig({ GOOGLE_GENERATIVE_AI_API_KEY: "k" });
    expect(result).toEqual({
      ok: true,
      config: { provider: "google", modelId: "gemini-3.8-flash", apiKey: "k" },
    });
    expect(DEFAULT_MODELS.google).toBe("gemini-3.8-flash");
  });

  it("switches to anthropic with one env var and its own default model", () => {
    const result = resolveAiConfig({ AI_PROVIDER: "Anthropic", ANTHROPIC_API_KEY: "k" });
    expect(result).toMatchObject({ ok: true, config: { provider: "anthropic", modelId: "claude-haiku-5-5" } });
  });

  it("honors an AI_MODEL override and trims values", () => {
    const result = resolveAiConfig({ AI_MODEL: " custom-model ", GOOGLE_GENERATIVE_AI_API_KEY: " k " });
    expect(result).toMatchObject({ ok: true, config: { modelId: "custom-model", apiKey: "k" } });
  });

  it("is not configured without the selected provider's key or with an unknown provider (acceptance 12)", () => {
    const missing = { ok: false, reason: "missing_key", keyVar: "GOOGLE_GENERATIVE_AI_API_KEY" };
    expect(resolveAiConfig({})).toEqual(missing);
    expect(resolveAiConfig({ GOOGLE_GENERATIVE_AI_API_KEY: "  " })).toEqual(missing);
    expect(resolveAiConfig({ ANTHROPIC_API_KEY: "k" })).toEqual(missing); // provider defaults to google
    expect(resolveAiConfig({ AI_PROVIDER: "openai", GOOGLE_GENERATIVE_AI_API_KEY: "k" })).toEqual({
      ok: false,
      reason: "unknown_provider",
    });
    expect(resolveAiConfig({ AI_PROVIDER: "anthropic" })).toEqual({
      ok: false,
      reason: "missing_key",
      keyVar: "ANTHROPIC_API_KEY",
    });
  });

  it("tolerates quotes and spaces pasted into env values", () => {
    const result = resolveAiConfig({
      AI_PROVIDER: ' "google" ',
      AI_MODEL: "'gemini-3.8-flash'",
      GOOGLE_GENERATIVE_AI_API_KEY: '"abc123"',
    });
    expect(result).toEqual({
      ok: true,
      config: { provider: "google", modelId: "gemini-3.8-flash", apiKey: "abc123" },
    });
  });
});

describe("describeAiStatus", () => {
  it("reports provider and model when configured, and never the key", () => {
    const status = describeAiStatus({ GOOGLE_GENERATIVE_AI_API_KEY: "super-secret" });
    expect(status).toEqual({ configured: true, provider: "google", model: "gemini-3.8-flash" });
    expect(JSON.stringify(status)).not.toContain("super-secret");
  });

  it("reports why AI is off", () => {
    expect(describeAiStatus({})).toEqual({
      configured: false,
      reason: "missing_key",
      keyVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    });
    expect(describeAiStatus({ AI_PROVIDER: "nope" })).toEqual({
      configured: false,
      reason: "unknown_provider",
    });
  });
});

describe("numeric grounding", () => {
  it("extracts figures but ignores list markers and letter-glued digits", () => {
    expect(extractNumbers("1. Do this\n2) Then 12 of 1,200 (81.9%) in Q4 by 2026-12-31")).toEqual([
      12, 1200, 81.9, 2026, 12, 31,
    ]);
  });

  it("allows numbers that appear in the request, including hours for course minutes", () => {
    expect(ungroundedNumbers("12 of 85 by December 31, 2026; a 2 hour course in 3 months", memoRequest)).toEqual([]);
  });

  it("flags numbers the request does not contain", () => {
    expect(ungroundedNumbers("Now 47 people, 15% missing", memoRequest)).toEqual([47, 15]);
  });

  it("compares percentages at one decimal", () => {
    expect(ungroundedNumbers("Compliance is 81.9%", { complianceRate: 81.94 })).toEqual([]);
    expect(ungroundedNumbers("Compliance is 82%", { complianceRate: 81.9 })).toEqual([82]);
  });
});

describe("runMemo", () => {
  it("returns a finalized memo without a warning when numbers check out", async () => {
    const { generate, calls } = fakeGenerator([goodMemo]);
    const result = await runMemo(memoRequest, aiConfig, generate);
    expect(result.ok && result.body.warning).toBeUndefined();
    expect(result.ok && result.body.subject).toBe("12 colleagues need training");
    expect(result.ok && result.body.body).toContain("December 31, 2026");
    expect(calls()).toBe(1);
  });

  it("regenerates once when the model invents a number, then accepts a clean one", async () => {
    const { generate, calls } = fakeGenerator([{ ...goodMemo, body: `${goodMemo.body}\n47 staff left.` }, goodMemo]);
    const result = await runMemo(memoRequest, aiConfig, generate);
    expect(calls()).toBe(2);
    expect(result.ok && result.body.warning).toBeUndefined();
  });

  it("returns the text with an unverified_numbers warning after a second bad attempt", async () => {
    const bad = { ...goodMemo, body: `${goodMemo.body}\n47 staff left.` };
    const { generate, calls } = fakeGenerator([bad, bad]);
    const result = await runMemo(memoRequest, aiConfig, generate);
    expect(calls()).toBe(2);
    expect(result.ok && result.body.warning).toBe("unverified_numbers");
  });

  it("fails (for a 502) when the model call fails", async () => {
    const { generate, calls } = fakeGenerator(["FAIL"]);
    expect(await runMemo(memoRequest, aiConfig, generate)).toEqual({ ok: false, code: "unknown" });
    expect(calls()).toBe(1);
  });
});

describe("runSummary and runRecommend", () => {
  const summaryRequest: SummaryRequest = {
    asOfDate: "2026-09-30", covered: 271, compliant: 222, atRisk: 49, exempt: 0, excluded: 13,
    notCovered: 16, complianceRate: 81.9, monthsRemaining: 3, deadline: "2026-12-31",
    topUnits: [{ unit: "Branch Operations", covered: 52, compliant: 40, atRisk: 12, complianceRate: 76.9 }],
  };

  it("accepts a grounded summary and flags an invented figure", async () => {
    const ok = await runSummary(summaryRequest, aiConfig, fakeGenerator([{ summary: "222 of 271 covered staff (81.9%) are compliant; 49 are at risk." }]).generate);
    expect(ok.ok && ok.body).toEqual({ summary: "222 of 271 covered staff (81.9%) are compliant; 49 are at risk." });
    const bad = await runSummary(summaryRequest, aiConfig, fakeGenerator([{ summary: "About 18% are at risk." }]).generate);
    expect(bad.ok && bad.body.warning).toBe("unverified_numbers");
  });

  it("caps summaries at 250 words", async () => {
    const long = Array.from({ length: 400 }, () => "word").join(" ");
    const result = await runSummary(summaryRequest, aiConfig, fakeGenerator([{ summary: long }]).generate);
    expect(result.ok && result.body.summary.split(/\s+/).length).toBeLessThanOrEqual(251);
  });

  it("filters recommendations against the submitted catalog", async () => {
    const request: RecommendRequest = {
      units: [{ unit: "Finance", atRiskLicensed: 1, atRiskUnlicensed: 0, topPositions: [] }],
      catalog: [{ courseId: "C1", title: "T", skillArea: "S", durationMinutes: 60, provider: "in_house" }],
    };
    const result = await runRecommend(
      request,
      aiConfig,
      fakeGenerator([{ recommendations: [{ unit: "Finance", courseIds: ["C1", "GHOST"], rationale: "ok" }] }]).generate,
    );
    expect(result.ok && result.body.recommendations[0].courseIds).toEqual(["C1"]);
  });
});

describe("AI call logging", () => {
  it("writes one line with route, provider, model, latency and status, and no payload", () => {
    const line = formatAiLog({ route: "memo", provider: "google", model: "gemini-3.8-flash", latencyMs: 812, status: "ok" });
    expect(line).toBe("ai_call route=memo provider=google model=gemini-3.8-flash latency_ms=812 status=ok error_code=-");
    expect(line).not.toContain("\n");
  });

  it("reduces errors to a short code, never the provider message", () => {
    const apiError = new APICallError({
      message: "Bad request: prompt was SECRET-UNIT with 12 employees",
      url: "https://example.com",
      requestBodyValues: { prompt: "SECRET-UNIT" },
      statusCode: 429,
    });
    expect(errorCode(apiError)).toBe("http_429");
    expect(errorCode(Object.assign(new Error("slow"), { name: "TimeoutError" }))).toBe("timeout");
    expect(errorCode(new Error("SECRET-UNIT"))).toBe("unknown");
    expect(errorCode(apiError)).not.toContain("SECRET");
  });
});
