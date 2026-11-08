import { formatDeadline } from "@/lib/ai/finalize";
import { deadlineOf, monthsRemaining, type UnitSummary } from "@/lib/engine";
import type { CatalogRow, MemoRequest, RulesConfig } from "@/lib/schemas";
import type { Analysis } from "./analysis";
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
    let sentence = `Closing the gap with the cheapest catalog courses would cost ${formatPeso(cost.costToClose)}`;
    if (config.budgetPhp > 0) {
      sentence +=
        cost.remaining >= 0
          ? `, which the ${formatPeso(config.budgetPhp)} budget covers with ${formatPeso(cost.remaining)} to spare`
          : `, which is ${formatPeso(-cost.remaining)} more than the ${formatPeso(config.budgetPhp)} budget`;
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
