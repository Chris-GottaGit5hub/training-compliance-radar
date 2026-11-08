export type AiProvider = "google" | "anthropic";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
const THINKING_LEVELS: readonly string[] = ["minimal", "low", "medium", "high"];
export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "low";
/** Tried when the primary Gemini model is overloaded (429/5xx) or times out. */
export const DEFAULT_FALLBACK_MODEL = "gemini-3.6-flash";

export interface AiConfig {
  provider: AiProvider;
  modelId: string;
  /** Same-provider backup model, or undefined for none (not a different provider). */
  fallbackModelId?: string;
  /** Gemini only: how much the model reasons before answering. Lower is faster. */
  thinkingLevel: ThinkingLevel;
  /** Never log or return this. */
  apiKey: string;
}

export type AiNotConfigured = {
  ok: false;
  reason: "unknown_provider" | "missing_key";
  /** Name of the env var that is missing (a name, never a value). */
  keyVar?: string;
};

export type AiConfigResult = { ok: true; config: AiConfig } | AiNotConfigured;

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  google: "gemini-3.8-flash",
  anthropic: "claude-haiku-5-5",
};

const KEY_VARS: Record<AiProvider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

/** Trims whitespace and one pair of surrounding quotes, a common slip when pasting env values. */
const clean = (value: string | undefined): string =>
  (value ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();

/**
 * Spec §7: AI_PROVIDER defaults to google, AI_MODEL to that provider's default.
 * An unknown provider or a missing key means "not configured" (routes return 503),
 * with a reason so the problem can be diagnosed without exposing any value.
 */
export function resolveAiConfig(env: Record<string, string | undefined>): AiConfigResult {
  const provider = clean(env.AI_PROVIDER).toLowerCase() || "google";
  if (provider !== "google" && provider !== "anthropic") {
    return { ok: false, reason: "unknown_provider" };
  }
  const keyVar = KEY_VARS[provider];
  const apiKey = clean(env[keyVar]);
  if (!apiKey) return { ok: false, reason: "missing_key", keyVar };
  const level = clean(env.AI_THINKING_LEVEL).toLowerCase();
  const modelId = clean(env.AI_MODEL) || DEFAULT_MODELS[provider];
  const fallbackRaw = clean(env.AI_FALLBACK_MODEL);
  const fallback =
    fallbackRaw.toLowerCase() === "none"
      ? ""
      : fallbackRaw || (provider === "google" ? DEFAULT_FALLBACK_MODEL : "");
  return {
    ok: true,
    config: {
      provider,
      modelId,
      ...(fallback && fallback !== modelId ? { fallbackModelId: fallback } : {}),
      thinkingLevel: THINKING_LEVELS.includes(level) ? (level as ThinkingLevel) : DEFAULT_THINKING_LEVEL,
      apiKey,
    },
  };
}

export type AiStatus =
  | { configured: true; provider: AiProvider; model: string; fallbackModel?: string }
  | { configured: false; reason: AiNotConfigured["reason"]; keyVar?: string };

/** Safe to expose publicly: provider and model names, or why AI is off. Never the key. */
export function describeAiStatus(env: Record<string, string | undefined>): AiStatus {
  const result = resolveAiConfig(env);
  if (result.ok) {
    const { provider, modelId, fallbackModelId } = result.config;
    return {
      configured: true,
      provider,
      model: modelId,
      ...(fallbackModelId ? { fallbackModel: fallbackModelId } : {}),
    };
  }
  return {
    configured: false,
    reason: result.reason,
    ...(result.keyVar ? { keyVar: result.keyVar } : {}),
  };
}
