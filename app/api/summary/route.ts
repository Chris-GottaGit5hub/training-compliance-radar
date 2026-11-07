import { runSummary } from "@/lib/ai/run";
import { handleAiRequest } from "@/lib/api/handler";
import { summaryRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, { schema: summaryRequestSchema, run: runSummary });
}
