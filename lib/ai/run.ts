import {
  API_LIMITS,
  memoModelSchema,
  recommendModelSchema,
  summaryModelSchema,
  type MemoRequest,
  type MemoResponse,
  type RecommendRequest,
  type RecommendResponse,
  type SummaryRequest,
  type SummaryResponse,
} from "@/lib/schemas";
import type { AiConfig } from "./config";
import { finalizeMemo, finalizeRecommendations, limitWords } from "./finalize";
import { generateStructured, type StructuredGenerator } from "./generate";
import { ungroundedNumbers } from "./grounding";
import {
  MEMO_INSTRUCTIONS,
  RECOMMEND_INSTRUCTIONS,
  SUMMARY_INSTRUCTIONS,
  memoPrompt,
  recommendPrompt,
  summaryPrompt,
} from "./prompts";

export type RunResult<T> = { ok: true; body: T } | { ok: false };

const MAX_ATTEMPTS = 2; // spec §5: regenerate once if numbers do not match the request

export async function runRecommend(
  request: RecommendRequest,
  config: AiConfig,
  generate: StructuredGenerator = generateStructured,
): Promise<RunResult<RecommendResponse>> {
  const result = await generate({
    route: "recommend",
    config,
    schema: recommendModelSchema,
    instructions: RECOMMEND_INSTRUCTIONS,
    prompt: recommendPrompt(request),
  });
  return result.ok ? { ok: true, body: finalizeRecommendations(result.output, request) } : { ok: false };
}

/** Generates text, then checks every number against the request; one regeneration, then a warning. */
async function generateGrounded<T extends { warning?: "unverified_numbers" }>(
  attempt: () => Promise<{ ok: true; value: T; text: string } | { ok: false }>,
  request: unknown,
): Promise<RunResult<T>> {
  let last: { value: T; text: string } | null = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = await attempt();
    if (!result.ok) return { ok: false };
    last = result;
    if (ungroundedNumbers(result.text, request).length === 0) return { ok: true, body: result.value };
  }
  return { ok: true, body: { ...last!.value, warning: "unverified_numbers" } };
}

export function runMemo(
  request: MemoRequest,
  config: AiConfig,
  generate: StructuredGenerator = generateStructured,
): Promise<RunResult<MemoResponse>> {
  return generateGrounded<MemoResponse>(async () => {
    const result = await generate({
      route: "memo",
      config,
      schema: memoModelSchema,
      instructions: MEMO_INSTRUCTIONS,
      prompt: memoPrompt(request),
    });
    if (!result.ok) return { ok: false };
    const memo = finalizeMemo(result.output, request);
    return { ok: true, value: memo, text: `${memo.subject}\n${memo.body}` };
  }, request);
}

export function runSummary(
  request: SummaryRequest,
  config: AiConfig,
  generate: StructuredGenerator = generateStructured,
): Promise<RunResult<SummaryResponse>> {
  return generateGrounded<SummaryResponse>(async () => {
    const result = await generate({
      route: "summary",
      config,
      schema: summaryModelSchema,
      instructions: SUMMARY_INSTRUCTIONS,
      prompt: summaryPrompt(request),
    });
    if (!result.ok) return { ok: false };
    const summary = limitWords(result.output.summary, API_LIMITS.maxSummaryWords);
    return { ok: true, value: { summary }, text: summary };
  }, request);
}
