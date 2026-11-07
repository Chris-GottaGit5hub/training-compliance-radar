import type { AtRiskRow } from "@/lib/analysis";

export const EMPLOYEE_LIST_TOKEN = "{{EMPLOYEE_LIST}}";

/**
 * Client-side only: swaps the memo's {{EMPLOYEE_LIST}} token for the unit's at-risk
 * names. Names never leave the browser; the server only ever sees the token.
 */
export function mergeEmployeeList(
  body: string,
  rows: readonly Pick<AtRiskRow, "name" | "position">[],
): string {
  const list =
    rows.length === 0
      ? "(no at-risk employees)"
      : rows.map((r) => `- ${r.name} (${r.position})`).join("\n");
  return body.split(EMPLOYEE_LIST_TOKEN).join(list);
}

/** Fallback when the AI returns no valid course: a LinkedIn Learning search for the topic. */
export function linkedinSearchUrl(query: string): string {
  return `https://www.linkedin.com/learning/search?keywords=${encodeURIComponent(query)}`;
}
