import {
  API_LIMITS,
  type MemoRequest,
  type RecommendRequest,
  type RecommendResponse,
} from "@/lib/schemas";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-12-31" -> "December 31, 2026" without touching Date or time zones. */
export function formatDeadline(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/**
 * Spec §5: drop course IDs not in the submitted catalog and units not in the request,
 * keep at most 3 IDs per unit, and flag units left with none for the search fallback.
 */
export function finalizeRecommendations(
  output: { recommendations: { unit: string; courseIds: string[]; rationale: string }[] },
  request: RecommendRequest,
): RecommendResponse {
  const validIds = new Set(request.catalog.map((c) => c.courseId));
  const byUnit = new Map<string, { ids: string[]; rationale: string }>();
  const requested = new Set(request.units.map((u) => u.unit));

  for (const rec of output.recommendations) {
    if (!requested.has(rec.unit) || byUnit.has(rec.unit)) continue;
    const ids = [...new Set(rec.courseIds.filter((id) => validIds.has(id)))].slice(
      0,
      API_LIMITS.maxCourseIds,
    );
    byUnit.set(rec.unit, { ids, rationale: rec.rationale });
  }

  return {
    recommendations: request.units.map(({ unit }) => {
      const found = byUnit.get(unit);
      const courseIds = found?.ids ?? [];
      return {
        unit,
        courseIds,
        rationale: (found?.rationale ?? "").slice(0, API_LIMITS.maxRationaleChars),
        fallbackSearch: courseIds.length === 0,
      };
    }),
  };
}

const TOKENS = ["{{AT_RISK_COUNT}}", "{{COVERED_COUNT}}", "{{DEADLINE}}"] as const;
export const EMPLOYEE_LIST = "{{EMPLOYEE_LIST}}";

/**
 * Spec §5: the model writes tokens instead of facts. The server fills in the real
 * values (prepending a fixed fact sentence if any token is missing) and guarantees
 * {{EMPLOYEE_LIST}} appears exactly once in the body.
 */
export function finalizeMemo(
  output: { subject: string; body: string },
  request: MemoRequest,
): { subject: string; body: string } {
  const values: Record<(typeof TOKENS)[number], string> = {
    "{{AT_RISK_COUNT}}": String(request.atRiskCount),
    "{{COVERED_COUNT}}": String(request.coveredCount),
    "{{DEADLINE}}": formatDeadline(request.deadline),
  };
  const fill = (text: string) =>
    TOKENS.reduce((acc, token) => acc.split(token).join(values[token]), text);

  let body = output.body;
  if (TOKENS.some((token) => !body.includes(token))) {
    body =
      `Of ${request.coveredCount} covered employees in ${request.unit}, ` +
      `${request.atRiskCount} have no qualifying training yet. ` +
      `The deadline is ${formatDeadline(request.deadline)}.\n\n${body}`;
  }
  body = fill(body);

  const parts = body.split(EMPLOYEE_LIST);
  body =
    parts.length === 1
      ? `${body.trimEnd()}\n\n${EMPLOYEE_LIST}`
      : `${parts[0]}${EMPLOYEE_LIST}${parts.slice(1).join("")}`;

  return { subject: fill(output.subject).split(EMPLOYEE_LIST).join("").trim(), body };
}

/** Cuts a summary to `maxWords`, ending on a sentence boundary when possible. */
export function limitWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  const cut = words.slice(0, maxWords).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return lastStop > cut.length / 2 ? cut.slice(0, lastStop + 1) : `${cut}…`;
}
