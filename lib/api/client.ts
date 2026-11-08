import type { z } from "zod";

export type AiPath = "/api/recommend" | "/api/memo" | "/api/summary";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; notConfigured: boolean };

/** Error body the routes return (codes only; never request contents). */
export interface ApiErrorBody {
  error?: string;
  reason?: string;
  keyVar?: string;
  code?: string;
}

/** The browser gives up after this long so a loading state can never stick (server limit is 60 s). */
export const CLIENT_TIMEOUT_MS = 55_000;

/** User-facing text for each status the routes can return (spec §5). */
export function describeApiError(status: number): string {
  switch (status) {
    case 0:
      return "Could not reach the server. Check your connection and try again.";
    case 400:
      return "The request was rejected as invalid. Reload the page and try again.";
    case 408:
      return "The AI request took too long. Try again.";
    case 413:
      return "The request was too large to send.";
    case 429:
      return "Too many AI requests. Wait about a minute and try again.";
    case 502:
      return "The AI service failed or timed out. Try again.";
    case 503:
      return "AI is not configured on this server.";
    default:
      return `Something went wrong (HTTP ${status}).`;
  }
}

const PROVIDER_CODES: Record<string, string> = {
  http_400: "The AI provider rejected the request.",
  http_401: "The AI provider rejected the API key.",
  http_403: "The AI provider rejected the API key or this model is not allowed for it.",
  http_404: "The AI provider does not know this model name.",
  http_429: "The AI provider's quota or rate limit was reached. Try again later.",
  timeout: "The AI provider did not answer in time.",
  invalid_output: "The AI returned a response in an unexpected format.",
};

/** Adds the server's reason or error code (when present) to the generic message. */
export function describeApiFailure(status: number, body?: ApiErrorBody): string {
  const base = describeApiError(status);
  if (status === 503 && body?.reason === "missing_key") {
    return (
      `AI is not configured on this server: ${body.keyVar ?? "the API key"} is not set for this ` +
      "deployment. The site owner needs to add it in Vercel (Settings → Environment Variables, " +
      "Production) and redeploy."
    );
  }
  if (status === 503 && body?.reason === "unknown_provider") {
    return 'AI is not configured on this server: AI_PROVIDER must be "google" or "anthropic".';
  }
  if (status === 502 && body?.code) {
    const detail = PROVIDER_CODES[body.code] ?? `Error code: ${body.code}.`;
    return `${base} ${detail}`;
  }
  return base;
}

const failure = (status: number, body?: ApiErrorBody): ApiResult<never> => ({
  ok: false,
  status,
  message: describeApiFailure(status, body),
  notConfigured: status === 503 && body?.error === "ai_not_configured",
});

/** POSTs an aggregates-only payload and validates the response with `schema`. Never throws. */
export async function postAi<S extends z.ZodType>(
  path: AiPath,
  body: unknown,
  schema: S,
  options: { timeoutMs?: number } = {},
): Promise<ApiResult<z.infer<S>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? CLIENT_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      return failure(controller.signal.aborted ? 408 : 0);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => undefined);
      return failure(response.status, errorBody as ApiErrorBody | undefined);
    }

    const parsed = schema.safeParse(await response.json().catch(() => null));
    return parsed.success ? { ok: true, data: parsed.data } : failure(502);
  } catch {
    return failure(controller.signal.aborted ? 408 : 0);
  } finally {
    clearTimeout(timer);
  }
}
