import { recommendableCourses } from "@/lib/payload";
import type { CatalogRow, RulesConfig } from "@/lib/schemas";
import type { AtRiskRow } from "./analysis";
import type { Plan } from "./plan";
import { buildTemplateRecommendation } from "./templates";

export const NO_ROUTE = "No route yet";

export interface AssignContext {
  plan: Plan | null;
  catalog: readonly CatalogRow[] | null;
  config: RulesConfig;
  /** Course IDs the AI recommended for a unit, if any (its first LinkedIn one is preferred). */
  preferredCourseIds?: (unit: string) => readonly string[] | undefined;
}

/**
 * Spec §4.9 item 6: the one course each at-risk employee should complete and the date to finish
 * by. Runs in the browser only; the result is shown in the Unit Panel, the memo and the CSV.
 */
export function withAssignments(rows: readonly AtRiskRow[], ctx: AssignContext): AtRiskRow[] {
  const { plan, catalog, config } = ctx;
  const nov30 = `${config.year}-11-30`;
  const recommendable = catalog ? recommendableCourses(catalog, config) : [];
  const linkedin = recommendable.filter((c) => c.provider === "linkedin_learning");
  const titles = new Map((catalog ?? []).map((c) => [c.course_id, c.title]));
  const linkedinIds = new Set(linkedin.map((c) => c.course_id));

  const byUnit = new Map<string, AtRiskRow[]>();
  for (const r of rows) byUnit.set(r.unit, [...(byUnit.get(r.unit) ?? []), r]);

  const pick = (unit: string, from: readonly CatalogRow[]): string | undefined => {
    if (from.length === 0) return undefined;
    const rec = buildTemplateRecommendation({ unit }, byUnit.get(unit) ?? [], from, config);
    return rec.courseIds[0] === undefined ? undefined : titles.get(rec.courseIds[0]);
  };
  const linkedinPicks = new Map<string, string | undefined>();
  const linkedinPick = (unit: string): string | undefined => {
    if (!linkedinPicks.has(unit)) {
      const preferred = ctx.preferredCourseIds?.(unit)?.find((id) => linkedinIds.has(id));
      linkedinPicks.set(unit, preferred !== undefined ? titles.get(preferred) : pick(unit, linkedin));
    }
    return linkedinPicks.get(unit);
  };
  // Unlicensed staff cannot use LinkedIn for free, so they get a course outside it when one exists.
  const offLinkedIn = recommendable.filter((c) => c.provider !== "linkedin_learning");
  const otherPicks = new Map<string, string | undefined>();
  const otherPick = (unit: string): string | undefined => {
    if (!otherPicks.has(unit)) otherPicks.set(unit, pick(unit, offLinkedIn.length > 0 ? offLinkedIn : recommendable));
    return otherPicks.get(unit);
  };
  const canLinkedIn = config.elearningCounts && linkedin.length > 0;

  return rows.map((r) => {
    const route = (course: string | undefined, date: string | undefined): AtRiskRow =>
      course === undefined
        ? { ...r, recommendedCourse: NO_ROUTE, completeBy: undefined }
        : { ...r, recommendedCourse: course, completeBy: date };

    const a = plan?.assignments.get(r.employeeId);
    if (a) {
      switch (a.route) {
        case "run":
        case "window":
          return route(a.title, a.date);
        case "linkedin":
          return route(linkedinPick(r.unit), a.date ?? nov30);
        case "paid": {
          const course = linkedinPick(r.unit);
          return route(course === undefined ? undefined : `${course} (paid)`, a.date ?? nov30);
        }
        case "unplaced":
          return route(undefined, undefined);
      }
    }
    if (r.licensed && canLinkedIn) return route(linkedinPick(r.unit), nov30);
    return route(otherPick(r.unit), nov30);
  });
}
