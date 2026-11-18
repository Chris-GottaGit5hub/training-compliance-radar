import { formatDeadline } from "@/lib/ai/finalize";
import type { AtRiskRow } from "@/lib/analysis";

export const EMPLOYEE_LIST_TOKEN = "{{EMPLOYEE_LIST}}";

/** "- Name (Position) — Course, by November 30, 2026" (spec §4.9 item 6, §5). */
function line(r: Pick<AtRiskRow, "name" | "position" | "recommendedCourse" | "completeBy">): string {
  const base = `- ${r.name} (${r.position})`;
  if (!r.recommendedCourse) return base;
  return `${base} — ${r.recommendedCourse}${r.completeBy ? `, by ${formatDeadline(r.completeBy)}` : ""}`;
}

/**
 * Client-side only: swaps the memo's {{EMPLOYEE_LIST}} token for the unit's at-risk
 * names, each with their assigned course and date. Names never leave the browser; the
 * server only ever sees the token.
 */
export function mergeEmployeeList(
  body: string,
  rows: readonly Pick<AtRiskRow, "name" | "position" | "recommendedCourse" | "completeBy">[],
): string {
  const list = rows.length === 0 ? "(no at-risk employees)" : rows.map(line).join("\n");
  return body.split(EMPLOYEE_LIST_TOKEN).join(list);
}

/** Fallback when the AI returns no valid course: a LinkedIn Learning search for the topic. */
export function linkedinSearchUrl(query: string): string {
  return `https://www.linkedin.com/learning/search?keywords=${encodeURIComponent(query)}`;
}
