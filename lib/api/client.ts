import type { z } from "zod";

export type AiPath = "/api/recommend" | "/api/memo" | "/api/summary";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; notConfigured: boolean };

/** User-facing text for each status the routes can return (spec §5). */
export function describeApiError(status: number): string {
  switch (status) {
    case 0:
      return "Could not reach the server. Check your connection and try again.";
    case 400:
      return "The request was rejected as invalid. Reload the page and try again.";
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

const failure = (status: number, notConfigured = false): ApiResult<never> => ({
  ok: false,
  status,
  message: describeApiError(status),
  notConfigured,
});

/** POSTs an aggregates-only payload and validates the response with `schema`. */
export async function postAi<S extends z.ZodType>(
  path: AiPath,
  body: unknown,
  schema: S,
): Promise<ApiResult<z.infer<S>>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return failure(0);
  }

  if (!response.ok) {
    const code = await response
      .json()
      .then((b: { error?: string }) => b.error)
      .catch(() => undefined);
    return failure(response.status, response.status === 503 && code === "ai_not_configured");
  }

  const parsed = schema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { ok: true, data: parsed.data } : failure(502);
}
