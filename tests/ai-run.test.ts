import { APICallError, RetryError } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MODELS, describeAiStatus, resolveAiConfig, targetKey, type AiConfig } from "@/lib/ai/config";
import { chainCanHandOver, createModelCooldown, errorCode, formatAiLog, shouldTryFallback, withModelFallback, type StructuredGenerator } from "@/lib/ai/generate";
import { extractNumbers, ungroundedNumbers } from "@/lib/ai/grounding";
import { REGENERATE_ONLY_BEFORE_MS, runMemo, runRecommend, runSummary } from "@/lib/ai/run";
import type { MemoRequest, RecommendRequest, SummaryRequest } from "@/lib/schemas";

const aiConfig: AiConfig = { provider: "google", modelId: "gemini-3.8-flash", thinkingLevel: "low", apiKey: "test-key" };

afterEach(() => vi.useRealTimers());

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
      config: {
        provider: "google",
        modelId: "gemini-3.8-flash",
        backups: [{ provider: "google", modelId: "gemini-3.6-flash", apiKey: "k" }],
        thinkingLevel: "low",
        apiKey: "k",
      },
    });
    expect(DEFAULT_MODELS.google).toBe("gemini-3.8-flash");
  });

  it("has a default Gemini backup, which can be changed, listed or turned off", () => {
    const key = { GOOGLE_GENERATIVE_AI_API_KEY: "k" };
    const backupIds = (env: Record<string, string>) => {
      const r = resolveAiConfig({ ...key, ...env });
      return r.ok ? r.config.backups?.map(targetKey) : "not configured";
    };
    expect(backupIds({ AI_FALLBACK_MODEL: "gemini-3.5-flash" })).toEqual(["google:gemini-3.5-flash"]);
    expect(backupIds({ AI_FALLBACK_MODEL: " gemini-3.6-flash , gemini-3.8-flash " })).toEqual(["google:gemini-3.6-flash"]); // primary dropped
    expect(backupIds({ AI_FALLBACK_MODEL: "none" })).toBeUndefined();
    expect(backupIds({ AI_MODEL: "gemini-3.6-flash" })).toBeUndefined(); // default backup equals primary
    const claude = resolveAiConfig({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" });
    expect(claude.ok && claude.config.backups).toBeUndefined();
  });

  it("switches to groq with its own default model and Gemini 3.6 then 3.8 as backups (acceptance 16)", () => {
    const result = resolveAiConfig({ AI_PROVIDER: "groq", GROQ_API_KEY: "g", GOOGLE_GENERATIVE_AI_API_KEY: "k" });
    expect(result).toEqual({
      ok: true,
      config: {
        provider: "groq",
        modelId: "openai/gpt-oss-120b",
        apiKey: "g",
        backups: [
          { provider: "google", modelId: "gemini-3.6-flash", apiKey: "k" },
          { provider: "google", modelId: "gemini-3.8-flash", apiKey: "k" },
        ],
        thinkingLevel: "low",
      },
    });
  });

  it("skips backups whose provider has no key or is unknown, and keeps at most 3", () => {
    const groqOnly = resolveAiConfig({ AI_PROVIDER: "groq", GROQ_API_KEY: "g" });
    expect(groqOnly.ok && groqOnly.config.backups).toBeUndefined(); // no Google key: Gemini backups skipped
    const mixed = resolveAiConfig({
      GOOGLE_GENERATIVE_AI_API_KEY: "k",
      GROQ_API_KEY: "g",
      AI_FALLBACK_MODEL: "openai:gpt-9, groq:openai/gpt-oss-120b, anthropic:claude-haiku-5-5, gemini-3.6-flash, groq:openai/gpt-oss-20b, gemini-3.5-flash",
    });
    expect(mixed.ok && mixed.config.backups).toEqual([
      { provider: "groq", modelId: "openai/gpt-oss-120b", apiKey: "g" },
      { provider: "google", modelId: "gemini-3.6-flash", apiKey: "k" },
      { provider: "groq", modelId: "openai/gpt-oss-20b", apiKey: "g" },
    ]);
  });

  it("uses a low Gemini thinking level by default and accepts a valid override", () => {
    const base = { GOOGLE_GENERATIVE_AI_API_KEY: "k" };
    expect(resolveAiConfig({ ...base, AI_THINKING_LEVEL: " Minimal " })).toMatchObject({
      ok: true,
      config: { thinkingLevel: "minimal" },
    });
    expect(resolveAiConfig({ ...base, AI_THINKING_LEVEL: "banana" })).toMatchObject({
      config: { thinkingLevel: "low" },
    });
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
      config: {
        provider: "google",
        modelId: "gemini-3.8-flash",
        backups: [{ provider: "google", modelId: "gemini-3.6-flash", apiKey: "abc123" }],
        thinkingLevel: "low",
        apiKey: "abc123",
      },
    });
  });
});

describe("describeAiStatus", () => {
  it("reports provider and model when configured, and never the key", () => {
    const status = describeAiStatus({ GOOGLE_GENERATIVE_AI_API_KEY: "super-secret" });
    expect(status).toEqual({
      configured: true,
      provider: "google",
      model: "gemini-3.8-flash",
      backups: ["google:gemini-3.6-flash"],
    });
    expect(JSON.stringify(status)).not.toContain("super-secret");
  });

  it("lists cross-provider backups by name only, never a key", () => {
    const status = describeAiStatus({ AI_PROVIDER: "groq", GROQ_API_KEY: "groq-secret", GOOGLE_GENERATIVE_AI_API_KEY: "google-secret" });
    expect(status).toEqual({
      configured: true,
      provider: "groq",
      model: "openai/gpt-oss-120b",
      backups: ["google:gemini-3.6-flash", "google:gemini-3.8-flash"],
    });
    expect(JSON.stringify(status)).not.toMatch(/secret/);
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

  it("skips the regeneration when the first attempt was slow, returning a warning", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let calls = 0;
    const slowBad = (async () => {
      calls++;
      vi.setSystemTime(Date.now() + REGENERATE_ONLY_BEFORE_MS + 1_000); // the call "took" 16 s
      return { ok: true, output: { ...goodMemo, body: `${goodMemo.body}
47 staff left.` } };
    }) as unknown as StructuredGenerator;
    const result = await runMemo(memoRequest, aiConfig, slowBad);
    expect(calls).toBe(1);
    expect(result.ok && result.body.warning).toBe("unverified_numbers");
  });

  it("keeps the first answer, with a warning, if the regeneration fails", async () => {
    const bad = { ...goodMemo, body: `${goodMemo.body}
47 staff left.` };
    const { generate, calls } = fakeGenerator([bad, "FAIL"]);
    const result = await runMemo(memoRequest, aiConfig, generate);
    expect(calls()).toBe(2);
    expect(result.ok && result.body.warning).toBe("unverified_numbers");
    expect(result.ok && result.body.subject).toBe("12 colleagues need training");
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

describe("withModelFallback", () => {
  const log = () => {};
  const overloaded = () => new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 503 });
  const options = { totalMs: 2_000, firstMs: 100, log };

  it("falls back for overload, retired-model (404) and invalid-output errors", () => {
    for (const code of ["http_503", "http_500", "http_429", "http_429_daily", "timeout", "timeout_after_http_503", "http_404", "invalid_output"]) {
      expect(shouldTryFallback(code), code).toBe(true);
    }
    for (const code of ["http_400", "http_401", "http_403", "unknown"]) {
      expect(shouldTryFallback(code), code).toBe(false);
    }
  });

  it("moves past a retired model (404) to the next one in the chain", async () => {
    const retired = new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 404 });
    const tried: string[] = [];
    const result = await withModelFallback(["groq:a", "google:b", "google:c"], async (model) => {
      tried.push(model);
      if (model !== "google:c") throw model === "groq:a" ? overloaded() : retired;
      return "answer";
    }, options);
    expect(result).toEqual({ ok: true, value: "answer" });
    expect(tried).toEqual(["groq:a", "google:b", "google:c"]);
  });

  it("lets the caller hand over on other errors, e.g. a bad key when the next model is another provider", async () => {
    const badKey = new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 401 });
    const tried: string[] = [];
    const models = ["groq:a", "google:b", "google:c"];
    const result = await withModelFallback(models, async (model) => {
      tried.push(model);
      throw badKey;
    }, {
      ...options,
      canHandOver: (code, i) => code === "http_401" && models[i].split(":")[0] !== models[i + 1].split(":")[0],
    });
    expect(result).toEqual({ ok: false, code: "http_401" });
    expect(tried).toEqual(["groq:a", "google:b"]); // google:b -> google:c is the same provider, so it stops
  });

  it("uses the backup model when the primary is overloaded", async () => {
    const tried: string[] = [];
    const result = await withModelFallback(["primary", "backup"], async (model) => {
      tried.push(model);
      if (model === "primary") throw overloaded();
      return "answer";
    }, options);
    expect(result).toEqual({ ok: true, value: "answer" });
    expect(tried).toEqual(["primary", "backup"]);
  });

  it("moves on when the primary hangs past its own time limit", async () => {
    const result = await withModelFallback(["primary", "backup"], (model, signal) =>
      model === "primary"
        ? new Promise<string>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)))
        : Promise.resolve("answer"), options);
    expect(result).toEqual({ ok: true, value: "answer" });
  });

  it("does not try the backup for errors it would share (bad key, bad request)", async () => {
    const tried: string[] = [];
    const bad = new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 403 });
    const result = await withModelFallback(["primary", "backup"], async (model) => {
      tried.push(model);
      throw bad;
    }, options);
    expect(result).toEqual({ ok: false, code: "http_403" });
    expect(tried).toEqual(["primary"]);
  });

  it("reports the last error when every model fails, and logs each attempt", async () => {
    const lines: string[] = [];
    const result = await withModelFallback(["a", "b"], async () => { throw overloaded(); }, {
      ...options,
      log: (model, status, _ms, code) => lines.push(`${model}:${status}:${code}`),
    });
    expect(result).toEqual({ ok: false, code: "http_503" });
    expect(lines).toEqual(["a:error:http_503", "b:error:http_503"]);
  });

  it("skips a recently failed primary on later calls, then retries it after the cooldown", async () => {
    let now = 0;
    const cooldown = createModelCooldown(() => now, 1_000);
    const tried: string[] = [];
    const run = async (model: string) => {
      tried.push(model);
      if (model === "primary") throw overloaded();
      return "answer";
    };
    await withModelFallback(["primary", "backup"], run, { ...options, cooldown });
    await withModelFallback(["primary", "backup"], run, { ...options, cooldown });
    expect(tried).toEqual(["primary", "backup", "backup"]); // second call went straight to backup
    now = 1_001;
    await withModelFallback(["primary", "backup"], run, { ...options, cooldown });
    expect(tried).toEqual(["primary", "backup", "backup", "primary", "backup"]);
  });

  it("never cools down the only or last model", async () => {
    const cooldown = createModelCooldown(() => 0, 1_000);
    cooldown.trip("only");
    const result = await withModelFallback(["only"], async () => "ok", { ...options, cooldown });
    expect(result).toEqual({ ok: true, value: "ok" });
  });

  it("works with a single model", async () => {
    const result = await withModelFallback(["only"], async () => 42, options);
    expect(result).toEqual({ ok: true, value: 42 });
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

  it("recognizes Google's free-tier daily cap without keeping any provider text", () => {
    const body = '{"error":{"message":"Quota exceeded for metric free_tier_requests, limit: 20. Generate content requests per day limit exceeded on Free Tier."}}';
    const daily = new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 429, responseBody: body });
    const perMinute = new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 429, responseBody: "{}" });
    expect(errorCode(daily)).toBe("http_429_daily");
    expect(errorCode(perMinute)).toBe("http_429");
    expect(errorCode(new RetryError({ message: "m", reason: "maxRetriesExceeded", errors: [daily] }))).toBe("http_429_daily");
    expect(shouldTryFallback("http_429_daily")).toBe(true); // another model has its own daily allowance
  });

  it("looks through the SDK's retry wrapper to the real cause", () => {
    const overloaded = new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 503 });
    const gaveUp = new RetryError({ message: "failed", reason: "maxRetriesExceeded", errors: [overloaded, overloaded] });
    expect(errorCode(gaveUp)).toBe("http_503");
    const aborted = new RetryError({ message: "aborted", reason: "abort", errors: [overloaded] });
    expect(errorCode(aborted)).toBe("timeout_after_http_503");
    expect(errorCode(new RetryError({ message: "aborted", reason: "abort", errors: [] }))).toBe("timeout");
  });
});

describe("chainCanHandOver (spec §5 model chain)", () => {
  const targets = [{ provider: "groq" as const }, { provider: "google" as const }, { provider: "google" as const }];
  const canHandOver = chainCanHandOver(targets);

  it("hands a bad request or key over to a different provider, but not to the same one", () => {
    for (const code of ["http_400", "http_401", "http_403"]) {
      expect(canHandOver(code, 0), code).toBe(true); // groq -> google
      expect(canHandOver(code, 1), code).toBe(false); // google -> google
    }
  });

  it("always hands over overload, 404 and invalid-output errors, and never past the last model", () => {
    expect(canHandOver("http_404", 1)).toBe(true);
    expect(canHandOver("invalid_output", 1)).toBe(true);
    expect(canHandOver("http_429_daily", 1)).toBe(true);
    expect(canHandOver("http_400", 2)).toBe(false); // nothing after the last model
    expect(canHandOver("unknown", 0)).toBe(false);
  });
});
