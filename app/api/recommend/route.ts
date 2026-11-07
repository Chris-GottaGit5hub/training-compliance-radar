import { runRecommend } from "@/lib/ai/run";
import { handleAiRequest } from "@/lib/api/handler";
import { recommendRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, { schema: recommendRequestSchema, run: runRecommend });
}
