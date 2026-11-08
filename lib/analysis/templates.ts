import { formatDeadline } from "@/lib/ai/finalize";
import { deadlineOf, monthsRemaining, type UnitSummary } from "@/lib/engine";
import { recommendableCourses, topPositions, unitKey } from "@/lib/payload";
import type { CatalogRow, MemoRequest, RecommendResponse, RulesConfig } from "@/lib/schemas";
import type { Analysis, AtRiskRow } from "./analysis";
import { formatPercent, formatPeso } from "./format";

/*
 * Plain-text drafts built only from the engine's numbers, used when an AI call fails
 * (quota, outage, bad key) so the user always gets something usable. No AI, no network.
 * Memos keep the {{EMPLOYEE_LIST}} token; names are merged in by the browser as usual.
 */

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function courseLines(courses: readonly CatalogRow[]): string {
  if (courses.length === 0) return "";
  const lines = courses.slice(0, 5).map((c) => {
    const link = c.url ? ` - ${c.url}` : "";
    return `- ${c.title} (${c.duration_minutes} min)${link}`;
  });
  return `Suggested courses:\n${lines.join("\n")}\n\n`;
}

/** A memo draft for one unit, in the same shape the AI route returns. */
export function buildTemplateMemo(
  unit: UnitSummary,
  courses: readonly CatalogRow[],
  config: RulesConfig,
  tone: MemoRequest["tone"],
): { subject: string; body: string } {
  const deadline = formatDeadline(deadlineOf(config.year));
  const months = plural(monthsRemaining(config.asOfDate), "month");
  const who = `${unit.atRisk} of ${plural(unit.covered, "covered employee")} in ${unit.unit}`;

  if (tone === "friendly") {
    return {
      subject: `Friendly reminder: ${plural(unit.atRisk, "colleague")} in ${unit.unit} still need a training`,
      body:
        `Hello,\n\n` +
        `A quick early heads-up from the Learning and Development team: ${who} ` +
        `still ${unit.atRisk === 1 ? "needs" : "need"} a qualifying training this year. ` +
        `The deadline is ${deadline}, about ${months} away, so there is still time.\n\n` +
        courseLines(courses) +
        `Could you gently remind these colleagues?\n\n{{EMPLOYEE_LIST}}\n\n` +
        `Thank you for helping your team stay on track!\n\nLearning and Development Team`,
    };
  }
  return {
    subject: `Action needed: ${plural(unit.atRisk, "employee")} in ${unit.unit} ${unit.atRisk === 1 ? "has" : "have"} no qualifying training yet`,
    body:
      `Dear Unit Head,\n\n` +
      `The Learning and Development office is writing to inform you that ${who} ` +
      `${unit.atRisk === 1 ? "has" : "have"} not yet completed a qualifying training this year. ` +
      `The deadline is ${deadline}, about ${months} away.\n\n` +
      courseLines(courses) +
      `Please arrange for the following employees to complete a training before the deadline:\n\n` +
      `{{EMPLOYEE_LIST}}\n\nThank you for your cooperation.\n\nLearning and Development Office`,
  };
}

/** An executive summary built from the engine's org numbers. */
export function buildTemplateSummary(analysis: Analysis, config: RulesConfig): string {
  const { org, cost } = analysis;
  const months = plural(org.monthsRemaining, "month");
  const parts: string[] = [
    `As of ${config.asOfDate}, ${org.compliant} of ${plural(org.covered, "covered employee")} ` +
      `(${formatPercent(org.complianceRate)}) are compliant and ${org.atRisk} ` +
      `${org.atRisk === 1 ? "is" : "are"} at risk. ${org.exempt} exempt, ${org.excluded} excluded ` +
      `and ${org.notCovered} not covered.`,
  ];

  const top = org.unitsRanked.filter((u) => u.atRisk > 0).slice(0, 3);
  parts.push(
    top.length === 0
      ? "No unit has at-risk employees."
      : `The units with the most at-risk employees are ${joinList(top.map((u) => `${u.unit} (${u.atRisk})`))}.`,
  );
  parts.push(`There ${org.monthsRemaining === 1 ? "is" : "are"} ${months} left until the ${formatDeadline(org.deadline)} deadline.`);

  if (cost) {
    let sentence = `Closing the gap with the cheapest mix of available trainings would cost ${formatPeso(cost.costToClose)}`;
    if (config.budgetPhp > 0) {
      sentence +=
        cost.remaining >= 0
          ? `, which the remaining budget covers, leaving ${formatPeso(cost.remaining)} of the ${formatPeso(config.budgetPhp)} annual budget`
          : `, which is ${formatPeso(-cost.remaining)} more than the remaining budget`;
    }
    sentence += ".";
    if (cost.unpricedCount > 0) {
      sentence += ` This is a lower bound: ${plural(cost.unpricedCount, "at-risk employee")} ` +
        `${cost.unpricedCount === 1 ? "has" : "have"} no qualifying course in the catalog.`;
    }
    parts.push(sentence);
  }

  parts.push(
    top.length === 0
      ? "Recommended next step: keep monitoring and confirm that new hires complete a training."
      : "Recommended next step: send early-warning memos to the highest-risk units first.",
  );
  return parts.join(" ");
}

const STOP_WORDS = new Set(["and", "the", "for", "with", "from", "into", "your", "of", "in", "to", "on"]);

/** Lower-case words of 3+ letters, without filler words. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/** Same word, or the same 5-letter stem (accountant / accounting, operation / operations). */
const sameStem = (a: string, b: string): boolean =>
  a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

/**
 * Course picks for one unit without AI (spec §6): up to 3 qualifying courses ranked by how
 * many of the unit's words (its name and top positions) appear in the course title or skill
 * area, then lowest cost per head, then shortest, then course ID. Same shape as the AI route.
 */
export function buildTemplateRecommendation(
  unit: UnitSummary,
  atRisk: readonly AtRiskRow[],
  catalog: readonly CatalogRow[],
  config: RulesConfig,
): RecommendResponse["recommendations"][number] {
  const unitWords = [...new Set(words([unit.unit, ...topPositions(atRisk, unit.unit)].join(" ")))];
  const ranked = recommendableCourses(catalog, config)
    .map((course) => {
      const courseWords = words(`${course.title} ${course.skill_area}`);
      const score = unitWords.filter((w) => courseWords.some((c) => sameStem(w, c))).length;
      return { course, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.course.cost_per_head - b.course.cost_per_head ||
        a.course.duration_minutes - b.course.duration_minutes ||
        (a.course.course_id < b.course.course_id ? -1 : a.course.course_id > b.course.course_id ? 1 : 0),
    )
    .slice(0, 3);

  return {
    unit: unitKey(unit.unit),
    courseIds: ranked.map((r) => r.course.course_id),
    rationale:
      ranked.length === 0
        ? "Template (no AI): no catalog course meets the minimum hours for this unit."
        : "Template picks (no AI): courses whose titles best match this unit and its most common at-risk roles, then the lowest cost and shortest duration.",
    fallbackSearch: ranked.length === 0,
  };
}
