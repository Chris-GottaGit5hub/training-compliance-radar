export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export const RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

const PRUNE_ABOVE = 5_000;

/**
 * In-memory sliding window. Best effort only: on serverless each instance has its own
 * counters (documented limitation; v2 would use a shared store).
 */
export function createRateLimiter(
  options: { limit?: number; windowMs?: number; now?: () => number } = {},
): RateLimiter {
  const { limit = RATE_LIMIT.limit, windowMs = RATE_LIMIT.windowMs, now = Date.now } = options;
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((time) => time > t - windowMs);

      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000)) };
      }

      recent.push(t);
      hits.set(key, recent);
      if (hits.size > PRUNE_ABOVE) {
        for (const [k, times] of hits) if (times.every((time) => time <= t - windowMs)) hits.delete(k);
      }
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

const SHARED = Symbol.for("training-compliance-radar.rate-limiter");

/** One limiter for all routes (10 requests/min per IP), shared across module copies. */
export function sharedRateLimiter(): RateLimiter {
  const store = globalThis as unknown as Record<symbol, RateLimiter | undefined>;
  return (store[SHARED] ??= createRateLimiter());
}

/** First address in x-forwarded-for, else x-real-ip, else "unknown". */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
