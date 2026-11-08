import { connection } from "next/server";
import { describeAiStatus } from "@/lib/ai/config";

/**
 * Reports whether AI is configured on this deployment and, if not, why.
 * Exposes only provider and model names or a reason code; never any key.
 */
export async function GET(): Promise<Response> {
  await connection(); // read env at request time, not at build time
  return Response.json(describeAiStatus(process.env), {
    headers: { "Cache-Control": "no-store" },
  });
}
