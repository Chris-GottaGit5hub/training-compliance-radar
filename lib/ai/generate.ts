import { APICallError, Output, RetryError, generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { z } from "zod";
import type { AiConfig, ThinkingLevel } from "./config";

/** Whole-call deadline (retries included). Must stay well under the routes' 60 s maxDuration. */
export const AI_TIMEOUT_MS = 40_000;

export type StructuredResult<T> = { ok: true; output: T } | { ok: false; code: string };

export interface StructuredCall<S extends z.ZodType> {
  route: string;
  config: AiConfig;
  schema: S;
  instructions: string;
  prompt: string;
  /** Diagnostics only: override the thinking level ("off" sends no thinking setting). */
  thinking?: ThinkingLevel | "off";
  /** Diagnostics only: override the whole-call deadline. */
  timeoutMs?: number;
}

/** Injectable so route logic can be tested without a network call. */
export type StructuredGenerator = <S extends z.ZodType>(
  call: StructuredCall<S>,
) => Promise<StructuredResult<z.infer<S>>>;

function getModel(config: AiConfig) {
  return config.provider === "google"
    ? createGoogleGenerativeAI({ apiKey: config.apiKey })(config.modelId)
    : createAnthropic({ apiKey: config.apiKey })(config.modelId);
}

/** A short code only: provider error messages can echo the prompt, so they are never kept. */
export function errorCode(error: unknown): string {
  if (RetryError.isInstance(error)) {
    // The SDK wraps retried failures; report the underlying cause (e.g. http_429, http_503).
    const inner = error.lastError === undefined ? "unknown" : errorCode(error.lastError);
    return error.reason === "abort" && error.errors.length > 0 ? `timeout_after_${inner}` : error.reason === "abort" ? "timeout" : inner;
  }
  if (error instanceof APICallError) return `http_${error.statusCode ?? "unknown"}`;
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

/** Errors worth a second model: overload, rate limits, server errors, slowness. */
export const shouldTryFallback = (code: string): boolean =>
  /^(http_5\d\d|http_429|timeout)/.test(code);

/** How long the primary model gets before the fallback is tried. */
export const PRIMARY_TIMEOUT_MS = 15_000;

/**
 * Runs `run` on each model in turn. A model that fails with an overload-type error or a
 * timeout hands over to the next one; other errors (bad request, bad key) stop right away
 * because another model would fail the same way. All models share one overall deadline.
 */
export async function withModelFallback<T>(
  models: readonly string[],
  run: (modelId: string, signal: AbortSignal) => Promise<T>,
  options: {
    totalMs: number;
    firstMs: number;
    log: (modelId: string, status: "ok" | "error", latencyMs: number, code?: string) => void;
  },
): Promise<{ ok: true; value: T } | { ok: false; code: string }> {
  const overall = AbortSignal.timeout(options.totalMs);
  let lastCode = "unknown";

  for (let i = 0; i < models.length; i++) {
    const isLast = i === models.length - 1;
    const signal = isLast ? overall : AbortSignal.any([overall, AbortSignal.timeout(options.firstMs)]);
    const started = Date.now();
    try {
      const value = await run(models[i], signal);
      options.log(models[i], "ok", Date.now() - started);
      return { ok: true, value };
    } catch (error) {
      lastCode = errorCode(error);
      options.log(models[i], "error", Date.now() - started, lastCode);
      if (isLast || overall.aborted || !shouldTryFallback(lastCode)) break;
    }
  }
  return { ok: false, code: lastCode };
}

/**
 * Structured output via generateText + Output.object, temperature 0.3, one SDK retry, a 40 s
 * overall deadline, Gemini thinking kept low, and a same-provider fallback model.
 */
export const generateStructured: StructuredGenerator = async (call) => {
  const thinking = call.thinking ?? call.config.thinkingLevel;
  const models = [
    call.config.modelId,
    ...(call.config.fallbackModelId ? [call.config.fallbackModelId] : []),
  ];

  const attempt = (modelId: string, signal: AbortSignal, withThinking: boolean) =>
    generateText({
      model: getModel({ ...call.config, modelId }),
      instructions: call.instructions,
      prompt: call.prompt,
      output: Output.object({ schema: call.schema }),
      temperature: 0.3,
      maxRetries: 1,
      abortSignal: signal,
      // Gemini 3 reasons by default, which made long outputs (memos) slow.
      ...(withThinking && call.config.provider === "google" && thinking !== "off"
        ? { providerOptions: { google: { thinkingConfig: { thinkingLevel: thinking } } } }
        : {}),
    });

  const result = await withModelFallback(
    models,
    async (modelId, signal) => {
      try {
        return await attempt(modelId, signal, true);
      } catch (error) {
        // If the provider rejects the thinking setting, retry once without it.
        if (call.config.provider !== "google" || errorCode(error) !== "http_400") throw error;
        return attempt(modelId, signal, false);
      }
    },
    {
      totalMs: call.timeoutMs ?? AI_TIMEOUT_MS,
      firstMs: Math.min(PRIMARY_TIMEOUT_MS, call.timeoutMs ?? AI_TIMEOUT_MS),
      log: (model, status, latencyMs, code) =>
        console.info(
          formatAiLog({ route: call.route, provider: call.config.provider, model, latencyMs, status, code }),
        ),
    },
  );

  return result.ok
    ? { ok: true, output: result.value.output as z.infer<typeof call.schema> }
    : { ok: false, code: result.code };
};
