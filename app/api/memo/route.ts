import { runMemo } from "@/lib/ai/run";
import { handleAiRequest } from "@/lib/api/handler";
import { memoRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, { schema: memoRequestSchema, run: runMemo });
}
