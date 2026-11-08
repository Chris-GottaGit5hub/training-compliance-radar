export const AI_PROVIDERS = ["google", "anthropic", "groq"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
const THINKING_LEVELS: readonly string[] = ["minimal", "low", "medium", "high"];
export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "low";

/** At most this many backups, so every model gets a fair share of the 40 s deadline. */
export const MAX_BACKUPS = 3;

/** One model on one provider, with that provider's key. */
export interface ModelTarget {
  provider: AiProvider;
  modelId: string;
  /** Never log or return this. */
  apiKey: string;
}

export interface AiConfig extends ModelTarget {
  /** Tried in order when the primary fails (spec §7). Absent when there are none. */
  backups?: ModelTarget[];
  /** Gemini only: how much the model reasons before answering. Lower is faster. */
  thinkingLevel: ThinkingLevel;
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
  groq: "openai/gpt-oss-120b",
};

/** Backups used when AI_FALLBACK_MODEL is unset. Entries whose provider has no key are skipped. */
export const DEFAULT_BACKUPS: Record<AiProvider, string[]> = {
  google: ["gemini-3.6-flash"],
  anthropic: [],
  groq: ["google:gemini-3.6-flash", "google:gemini-3.8-flash"],
};

export const KEY_VARS: Record<AiProvider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
};

const isProvider = (value: string): value is AiProvider =>
  (AI_PROVIDERS as readonly string[]).includes(value);

/** Trims whitespace and one pair of surrounding quotes, a common slip when pasting env values. */
const clean = (value: string | undefined): string =>
  (value ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();

export const targetKey = (t: Pick<ModelTarget, "provider" | "modelId">): string =>
  `${t.provider}:${t.modelId}`;

/**
 * Parses the backup list: comma-separated entries, each `model` (same provider as the
 * primary) or `provider:model`. Entries with an unknown provider or no key for their
 * provider are skipped, as are duplicates and the primary itself.
 */
function resolveBackups(
  raw: string,
  primary: ModelTarget,
  env: Record<string, string | undefined>,
): ModelTarget[] {
  const entries = raw.toLowerCase() === "none" ? [] : raw ? raw.split(",") : DEFAULT_BACKUPS[primary.provider];
  const seen = new Set([targetKey(primary)]);
  const backups: ModelTarget[] = [];
  for (const entry of entries.map(clean).filter(Boolean)) {
    const colon = entry.indexOf(":");
    const prefix = colon > 0 ? entry.slice(0, colon).toLowerCase() : "";
    if (colon > 0 && !isProvider(prefix)) continue;
    const provider = colon > 0 ? (prefix as AiProvider) : primary.provider;
    const modelId = colon > 0 ? entry.slice(colon + 1).trim() : entry;
    const apiKey = provider === primary.provider ? primary.apiKey : clean(env[KEY_VARS[provider]]);
    const target = { provider, modelId, apiKey };
    if (!modelId || !apiKey || seen.has(targetKey(target))) continue;
    seen.add(targetKey(target));
    backups.push(target);
  }
  return backups.slice(0, MAX_BACKUPS);
}

/**
 * Spec §7: AI_PROVIDER defaults to google, AI_MODEL to that provider's default.
 * An unknown provider or a missing key means "not configured" (routes return 503),
 * with a reason so the problem can be diagnosed without exposing any value.
 */
export function resolveAiConfig(env: Record<string, string | undefined>): AiConfigResult {
  const provider = clean(env.AI_PROVIDER).toLowerCase() || "google";
  if (!isProvider(provider)) return { ok: false, reason: "unknown_provider" };
  const keyVar = KEY_VARS[provider];
  const apiKey = clean(env[keyVar]);
  if (!apiKey) return { ok: false, reason: "missing_key", keyVar };
  const level = clean(env.AI_THINKING_LEVEL).toLowerCase();
  const primary: ModelTarget = { provider, modelId: clean(env.AI_MODEL) || DEFAULT_MODELS[provider], apiKey };
  const backups = resolveBackups(clean(env.AI_FALLBACK_MODEL), primary, env);
  return {
    ok: true,
    config: {
      ...primary,
      ...(backups.length > 0 ? { backups } : {}),
      thinkingLevel: THINKING_LEVELS.includes(level) ? (level as ThinkingLevel) : DEFAULT_THINKING_LEVEL,
    },
  };
}

export type AiStatus =
  | { configured: true; provider: AiProvider; model: string; backups?: string[] }
  | { configured: false; reason: AiNotConfigured["reason"]; keyVar?: string };

/** Safe to expose publicly: provider and model names, or why AI is off. Never a key. */
export function describeAiStatus(env: Record<string, string | undefined>): AiStatus {
  const result = resolveAiConfig(env);
  if (result.ok) {
    const { provider, modelId, backups } = result.config;
    return {
      configured: true,
      provider,
      model: modelId,
      ...(backups ? { backups: backups.map(targetKey) } : {}),
    };
  }
  return {
    configured: false,
    reason: result.reason,
    ...(result.keyVar ? { keyVar: result.keyVar } : {}),
  };
}
