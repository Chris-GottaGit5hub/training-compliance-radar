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

/** Structured output via generateText + Output.object, temperature 0.3, 25 s timeout, 1 retry. */
export const generateStructured: StructuredGenerator = async (call) => {
  const started = Date.now();
  const log = (status: "ok" | "error", code?: string) =>
    console.info(
      formatAiLog({
        route: call.route,
        provider: call.config.provider,
        model: call.config.modelId,
        latencyMs: Date.now() - started,
        status,
        code,
      }),
    );

  const signal = AbortSignal.timeout(call.timeoutMs ?? AI_TIMEOUT_MS);
  const thinking = call.thinking ?? call.config.thinkingLevel;
  const attempt = (withThinking: boolean) =>
    generateText({
      model: getModel(call.config),
      instructions: call.instructions,
      prompt: call.prompt,
      output: Output.object({ schema: call.schema }),
      temperature: 0.3,
      maxRetries: 1,
      abortSignal: signal,
      // Gemini 3 reasons by default, which made long outputs (memos) time out.
      ...(withThinking && call.config.provider === "google" && thinking !== "off"
        ? { providerOptions: { google: { thinkingConfig: { thinkingLevel: thinking } } } }
        : {}),
    });

  try {
    let result;
    try {
      result = await attempt(true);
    } catch (error) {
      // If the provider rejects the thinking setting, retry once without it.
      if (call.config.provider !== "google" || errorCode(error) !== "http_400") throw error;
      result = await attempt(false);
    }
    log("ok");
    return { ok: true, output: result.output as z.infer<typeof call.schema> };
  } catch (error) {
    const code = errorCode(error);
    log("error", code);
    return { ok: false, code };
  }
};
