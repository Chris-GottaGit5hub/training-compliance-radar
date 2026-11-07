import type { AtRiskRow } from "@/lib/analysis";
import { deadlineOf, monthsRemaining, qualifyingCourses } from "@/lib/engine";
import type { CostToClose, OrgSummary, UnitSummary } from "@/lib/engine";
import {
  API_LIMITS,
  type CatalogRow,
  type MemoRequest,
  type RecommendRequest,
  type RulesConfig,
  type SummaryRequest,
} from "@/lib/schemas";

/** Truncates to the API's string cap; clients use it to match response units to their own. */
export const capText = (value: string, max: number): string => value.slice(0, max);
export const unitKey = (unit: string): string => capText(unit, API_LIMITS.maxUnitChars);

/**
 * Positions held by at least `minCellSize` at-risk employees in the unit (small-cell
 * suppression, spec §5), most common first, at most `maxPositions`.
 */
export function topPositions(atRisk: readonly AtRiskRow[], unit: string): string[] {
  const counts = new Map<string, number>();
  for (const row of atRisk) {
    if (row.unit === unit) counts.set(row.position, (counts.get(row.position) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= API_LIMITS.minCellSize)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, API_LIMITS.maxPositions)
    .map(([position]) => capText(position, API_LIMITS.maxPositionChars));
}

/** Courses the AI may suggest: long enough, and no e-learning when it does not count. */
export function recommendableCourses(
  catalog: readonly CatalogRow[],
  config: RulesConfig,
): CatalogRow[] {
  return qualifyingCourses(catalog, config).filter(
    (c) => config.elearningCounts || c.provider !== "linkedin_learning",
  );
}

/** Aggregates only: unit names, counts, common positions, catalog fields. Null if nothing to ask. */
export function buildRecommendPayload(
  units: readonly UnitSummary[],
  atRisk: readonly AtRiskRow[],
  catalog: readonly CatalogRow[],
  config: RulesConfig,
): RecommendRequest | null {
  const courses = recommendableCourses(catalog, config).slice(0, API_LIMITS.maxCatalog);
  const needing = units.filter((u) => u.atRisk > 0).slice(0, API_LIMITS.maxUnits);
  if (courses.length === 0 || needing.length === 0) return null;
  return {
    units: needing.map((u) => ({
      unit: unitKey(u.unit),
      atRiskLicensed: u.atRiskLicensed,
      atRiskUnlicensed: u.atRiskUnlicensed,
      topPositions: topPositions(atRisk, u.unit),
    })),
    catalog: courses.map((c) => ({
      courseId: capText(c.course_id, 60),
      title: capText(c.title, API_LIMITS.maxTitleChars),
      skillArea: capText(c.skill_area, API_LIMITS.maxSkillAreaChars),
      durationMinutes: c.duration_minutes,
      provider: c.provider,
    })),
  };
}

export function buildMemoPayload(
  unit: UnitSummary,
  courses: readonly CatalogRow[],
  config: RulesConfig,
  tone: MemoRequest["tone"],
): MemoRequest {
  return {
    unit: unitKey(unit.unit),
    atRiskCount: unit.atRisk,
    coveredCount: unit.covered,
    deadline: deadlineOf(config.year),
    monthsRemaining: monthsRemaining(config.asOfDate),
    courses: courses.slice(0, API_LIMITS.maxCourses).map((c) => ({
      title: capText(c.title, API_LIMITS.maxTitleChars),
      ...(c.url ? { url: c.url } : {}),
      durationMinutes: c.duration_minutes,
    })),
    tone,
  };
}

export function buildSummaryPayload(
  org: OrgSummary,
  cost: CostToClose | null,
  config: RulesConfig,
): SummaryRequest {
  return {
    asOfDate: config.asOfDate,
    covered: org.covered,
    compliant: org.compliant,
    atRisk: org.atRisk,
    exempt: org.exempt,
    excluded: org.excluded,
    notCovered: org.notCovered,
    complianceRate: org.complianceRate,
    monthsRemaining: org.monthsRemaining,
    deadline: org.deadline,
    topUnits: org.unitsRanked.slice(0, API_LIMITS.maxTopUnits).map((u) => ({
      unit: unitKey(u.unit),
      covered: u.covered,
      compliant: u.compliant,
      atRisk: u.atRisk,
      complianceRate: u.complianceRate,
    })),
    ...(cost ? { costToClose: cost.costToClose } : {}),
    ...(config.budgetPhp > 0 ? { budgetPhp: config.budgetPhp } : {}),
  };
}
