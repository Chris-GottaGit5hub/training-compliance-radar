import { APICallError, Output, RetryError, generateText, type JSONValue } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { z } from "zod";
import { targetKey, type AiConfig, type ModelTarget } from "./config";

/** Whole-call deadline (retries included). Must stay well under the routes' 60 s maxDuration. */
export const AI_TIMEOUT_MS = 40_000;

export type StructuredResult<T> = { ok: true; output: T } | { ok: false; code: string };

export interface StructuredCall<S extends z.ZodType> {
  route: string;
  config: AiConfig;
  schema: S;
  instructions: string;
  prompt: string;
}

/** Injectable so route logic can be tested without a network call. */
export type StructuredGenerator = <S extends z.ZodType>(
  call: StructuredCall<S>,
) => Promise<StructuredResult<z.infer<S>>>;

function getModel(target: ModelTarget) {
  switch (target.provider) {
    case "google":
      return createGoogleGenerativeAI({ apiKey: target.apiKey })(target.modelId);
    case "groq":
      return createGroq({ apiKey: target.apiKey })(target.modelId);
    case "anthropic":
      return createAnthropic({ apiKey: target.apiKey })(target.modelId);
  }
}

/** A short code only: provider error messages can echo the prompt, so they are never kept. */
export function errorCode(error: unknown): string {
  if (RetryError.isInstance(error)) {
    // The SDK wraps retried failures; report the underlying cause (e.g. http_429, http_503).
    const inner = error.lastError === undefined ? "unknown" : errorCode(error.lastError);
    return error.reason === "abort" && error.errors.length > 0 ? `timeout_after_${inner}` : error.reason === "abort" ? "timeout" : inner;
  }
  if (error instanceof APICallError) {
    // Google's free tier caps requests per day; say so, without keeping any provider text.
    const daily = error.statusCode === 429 && /per ?day|PerDay/i.test(error.responseBody ?? "");
    return `http_${error.statusCode ?? "unknown"}${daily ? "_daily" : ""}`;
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  if (name.includes("NoObjectGenerated") || name.includes("NoOutputGenerated")) return "invalid_output";
  if (name.includes("TypeValidation") || name.includes("JSONParse")) return "invalid_output";
  return "unknown";
}

/** One line per AI call: route, provider, model, latency, status. Never the payload. */
export function formatAiLog(entry: {
  route: string;
  provider: string;
  model: string;
  latencyMs: number;
  status: "ok" | "error";
  code?: string;
}): string {
  return (
    `ai_call route=${entry.route} provider=${entry.provider} model=${entry.model} ` +
    `latency_ms=${entry.latencyMs} status=${entry.status} error_code=${entry.code ?? "-"}`
  );
}

/**
 * Errors worth the next model: overload, rate limits, server errors, slowness, a retired or
 * unknown model (404), and output that did not match the schema.
 */
export const shouldTryFallback = (code: string): boolean =>
  /^(http_5\d\d|http_429|http_404|timeout|invalid_output)/.test(code);

/** How long each model except the last gets before the next one is tried. */
export const PRIMARY_TIMEOUT_MS = 15_000;

/** After a model fails with an overload-type error, skip it for this long. */
export const MODEL_COOLDOWN_MS = 5 * 60_000;

export interface ModelCooldown {
  isCooling(modelId: string): boolean;
  trip(modelId: string): void;
}

/** In-memory (per server instance): avoids paying the primary's timeout on every request. */
export function createModelCooldown(
  now: () => number = Date.now,
  durationMs: number = MODEL_COOLDOWN_MS,
): ModelCooldown {
  const until = new Map<string, number>();
  return {
    isCooling: (modelId) => (until.get(modelId) ?? 0) > now(),
    trip: (modelId) => void until.set(modelId, now() + durationMs),
  };
}

const COOLDOWN_KEY = Symbol.for("training-compliance-radar.model-cooldown");
const sharedCooldown = (): ModelCooldown => {
  const store = globalThis as unknown as Record<symbol, ModelCooldown | undefined>;
  return (store[COOLDOWN_KEY] ??= createModelCooldown());
};

/**
 * Runs `run` on each model in turn. A model that fails with an overload-type error, a
 * timeout, a 404 or invalid output hands over to the next one; other errors (bad request,
 * bad key) stop unless `canHandOver` allows them. All models share one overall deadline.
 */
export async function withModelFallback<T>(
  models: readonly string[],
  run: (modelId: string, signal: AbortSignal) => Promise<T>,
  options: {
    totalMs: number;
    firstMs: number;
    log: (modelId: string, status: "ok" | "error", latencyMs: number, code?: string) => void;
    /** Optional: models that recently failed are skipped (the last model is always tried). */
    cooldown?: ModelCooldown;
    /** Whether model `index` may hand over to the next after `code`. Default: shouldTryFallback. */
    canHandOver?: (code: string, index: number) => boolean;
  },
): Promise<{ ok: true; value: T } | { ok: false; code: string }> {
  const handOver = options.canHandOver ?? shouldTryFallback;
  const overall = AbortSignal.timeout(options.totalMs);
  let lastCode = "unknown";

  for (let i = 0; i < models.length; i++) {
    const isLast = i === models.length - 1;
    if (!isLast && options.cooldown?.isCooling(models[i])) continue;
    const signal = isLast ? overall : AbortSignal.any([overall, AbortSignal.timeout(options.firstMs)]);
    const started = Date.now();
    try {
      const value = await run(models[i], signal);
      options.log(models[i], "ok", Date.now() - started);
      return { ok: true, value };
    } catch (error) {
      lastCode = errorCode(error);
      options.log(models[i], "error", Date.now() - started, lastCode);
      if (isLast || overall.aborted || !handOver(lastCode, i)) break;
      options.cooldown?.trip(models[i]);
    }
  }
  return { ok: false, code: lastCode };
}

/** Provider options that keep reasoning short (Gemini 3 and gpt-oss reason by default). */
function reasoningOptions(
  target: ModelTarget,
  config: AiConfig,
): Record<string, Record<string, JSONValue>> | undefined {
  if (target.provider === "google") {
    return { google: { thinkingConfig: { thinkingLevel: config.thinkingLevel } } };
  }
  if (target.provider === "groq") return { groq: { reasoningEffort: "low" } };
  return undefined;
}

/** A bad request or key on one provider says nothing about the next provider. */
export function chainCanHandOver(targets: readonly Pick<ModelTarget, "provider">[]) {
  return (code: string, i: number): boolean =>
    shouldTryFallback(code) ||
    (/^http_40[013]$/.test(code) &&
      targets[i + 1] !== undefined &&
      targets[i + 1].provider !== targets[i].provider);
}

/**
 * Structured output via generateText + Output.object, temperature 0.3, one SDK retry, a 40 s
 * overall deadline, short reasoning, and the configured chain of backup models (spec §5).
 */
export const generateStructured: StructuredGenerator = async (call) => {
  const targets: ModelTarget[] = [call.config, ...(call.config.backups ?? [])];
  const byKey = new Map(targets.map((t) => [targetKey(t), t]));

  const attempt = (target: ModelTarget, signal: AbortSignal, withReasoning: boolean) => {
    const providerOptions = withReasoning ? reasoningOptions(target, call.config) : undefined;
    return generateText({
      model: getModel(target),
      instructions: call.instructions,
      prompt: call.prompt,
      output: Output.object({ schema: call.schema }),
      temperature: 0.3,
      maxRetries: 1,
      abortSignal: signal,
      ...(providerOptions ? { providerOptions } : {}),
    });
  };

  const result = await withModelFallback(
    [...byKey.keys()],
    async (key, signal) => {
      const target = byKey.get(key)!;
      try {
        return await attempt(target, signal, true);
      } catch (error) {
        // If the provider rejects the reasoning setting, retry once without it.
        if (!reasoningOptions(target, call.config) || errorCode(error) !== "http_400") throw error;
        return attempt(target, signal, false);
      }
    },
    {
      cooldown: sharedCooldown(),
      totalMs: AI_TIMEOUT_MS,
      firstMs: PRIMARY_TIMEOUT_MS,
      canHandOver: chainCanHandOver(targets),
      log: (key, status, latencyMs, code) => {
        const target = byKey.get(key)!;
        console.info(
          formatAiLog({ route: call.route, provider: target.provider, model: target.modelId, latencyMs, status, code }),
        );
      },
    },
  );

  return result.ok
    ? { ok: true, output: result.value.output as z.infer<typeof call.schema> }
    : { ok: false, code: result.code };
};
