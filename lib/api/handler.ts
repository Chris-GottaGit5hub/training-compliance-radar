import type { z } from "zod";
import { resolveAiConfig, type AiConfig } from "@/lib/ai/config";
import type { RunResult } from "@/lib/ai/run";
import { API_LIMITS } from "@/lib/schemas/api";
import { clientIp, sharedRateLimiter, type RateLimiter } from "./rateLimit";

export interface AiRouteSpec<S extends z.ZodType, TRes> {
  schema: S;
  run: (data: z.infer<S>, config: AiConfig) => Promise<RunResult<TRes>>;
}

export interface HandlerDeps {
  limiter?: RateLimiter;
  env?: Record<string, string | undefined>;
}

const json = (body: unknown, status: number, headers?: Record<string, string>): Response =>
  Response.json(body, { status, headers });

/**
 * Shared guards for every AI route (spec §5): rate limit -> body size -> JSON -> zod ->
 * AI configured -> run. Error bodies carry codes only, never request contents.
 */
export async function handleAiRequest<S extends z.ZodType, TRes>(
  request: Request,
  spec: AiRouteSpec<S, TRes>,
  deps: HandlerDeps = {},
): Promise<Response> {
  const limit = (deps.limiter ?? sharedRateLimiter()).check(clientIp(request));
  if (!limit.allowed) {
    return json({ error: "rate_limited", retryAfterSec: limit.retryAfterSec }, 429, {
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  const declared = Number(request.headers.get("content-length"));
  if (declared > API_LIMITS.maxBodyBytes) return json({ error: "too_large" }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > API_LIMITS.maxBodyBytes) {
    return json({ error: "too_large" }, 413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = spec.schema.safeParse(parsedBody);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return json({ error: "invalid_request", issues }, 400);
  }

  const ai = resolveAiConfig(deps.env ?? process.env);
  if (!ai.ok) {
    return json(
      { error: "ai_not_configured", reason: ai.reason, ...(ai.keyVar ? { keyVar: ai.keyVar } : {}) },
      503,
    );
  }

  try {
    const result = await spec.run(parsed.data, ai.config);
    return result.ok
      ? json(result.body, 200)
      : json({ error: "ai_failed", ...(result.code ? { code: result.code } : {}) }, 502);
  } catch {
    return json({ error: "ai_failed" }, 502);
  }
}
