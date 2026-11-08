import { connection } from "next/server";
import { z } from "zod";
import { describeAiStatus, resolveAiConfig, type ThinkingLevel } from "@/lib/ai/config";
import { generateStructured } from "@/lib/ai/generate";
import { clientIp, sharedRateLimiter } from "@/lib/api/rateLimit";

export const maxDuration = 60;

const LEVELS = ["off", "minimal", "low", "medium", "high"];
// Probe-only allowlist so the endpoint cannot be used to call arbitrary models.
const PROBE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];
const headers = { "Cache-Control": "no-store" };

/**
 * Reports whether AI is configured on this deployment and, if not, why.
 * Exposes only provider and model names or a reason code; never any key.
 *
 * `?probe=1[&thinking=off|minimal|low|medium|high][&model=<allowlisted Gemini model>]` also makes one tiny model call
 * (no user data) and reports its latency and error code, to diagnose provider
 * problems. Probes share the 10 requests/min/IP limit.
 */
export async function GET(request: Request): Promise<Response> {
  await connection(); // read env at request time, not at build time
  const status = describeAiStatus(process.env);
  const params = new URL(request.url).searchParams;
  if (!params.has("probe") || !status.configured) return Response.json(status, { headers });

  const limit = sharedRateLimiter().check(clientIp(request));
  if (!limit.allowed) {
    return Response.json({ error: "rate_limited", retryAfterSec: limit.retryAfterSec }, { status: 429, headers });
  }

  const resolved = resolveAiConfig(process.env);
  if (!resolved.ok) return Response.json(status, { headers });
  const requested = params.get("thinking") ?? "";
  const thinking = (LEVELS.includes(requested) ? requested : resolved.config.thinkingLevel) as
    | ThinkingLevel
    | "off";

  const requestedModel = params.get("model") ?? "";
  const modelId = PROBE_MODELS.includes(requestedModel) ? requestedModel : resolved.config.modelId;

  const started = Date.now();
  const result = await generateStructured({
    route: "probe",
    config: { ...resolved.config, modelId },
    schema: z.object({ answer: z.string() }),
    instructions: "Reply with the single word OK.",
    prompt: "ping",
    thinking,
    timeoutMs: 20_000,
  });
  return Response.json(
    {
      ...status,
      probe: { model: modelId, ok: result.ok, ...(result.ok ? {} : { code: result.code }), thinking, latencyMs: Date.now() - started },
    },
    { headers },
  );
}
