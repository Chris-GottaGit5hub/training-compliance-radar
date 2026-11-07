export type AiProvider = "google" | "anthropic";

export interface AiConfig {
  provider: AiProvider;
  modelId: string;
  /** Never log or return this. */
  apiKey: string;
}

export type AiConfigResult = { ok: true; config: AiConfig } | { ok: false };

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  google: "gemini-3.8-flash",
  anthropic: "claude-haiku-5-5",
};

const KEY_VARS: Record<AiProvider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

/**
 * Spec §7: AI_PROVIDER defaults to google, AI_MODEL to that provider's default.
 * An unknown provider or a missing key means "not configured" (routes return 503).
 */
export function resolveAiConfig(env: Record<string, string | undefined>): AiConfigResult {
  const provider = (env.AI_PROVIDER?.trim().toLowerCase() || "google") as string;
  if (provider !== "google" && provider !== "anthropic") return { ok: false };
  const apiKey = env[KEY_VARS[provider]]?.trim();
  if (!apiKey) return { ok: false };
  return {
    ok: true,
    config: { provider, modelId: env.AI_MODEL?.trim() || DEFAULT_MODELS[provider], apiKey },
  };
}
