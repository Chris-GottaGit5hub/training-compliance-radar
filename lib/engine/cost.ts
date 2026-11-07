import type { RulesConfig } from "@/lib/schemas/config";
import type { CatalogRow, RosterRow } from "@/lib/schemas/rows";
import { licensedById } from "./summary";
import type { CostToClose, EmployeeResult } from "./types";

/** A course qualifies if it is at least minHours long (spec §4.2). */
export function qualifyingCourses(
  catalog: readonly CatalogRow[],
  config: RulesConfig,
): CatalogRow[] {
  return catalog.filter((c) => c.duration_minutes >= config.minHours * 60);
}

function cheapest(
  courses: readonly CatalogRow[],
  provider: CatalogRow["provider"],
): number | null {
  const costs = courses.filter((c) => c.provider === provider).map((c) => c.cost_per_head);
  return costs.length === 0 ? null : Math.min(...costs);
}

/**
 * Spec §4.2. Licensed at-risk staff use the cheapest qualifying LinkedIn
 * Learning course (only when e-learning counts); everyone else uses the
 * cheapest qualifying in-house course. A route with no course is "unpriced".
 */
export function costToClose(
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
  catalog: readonly CatalogRow[],
  config: RulesConfig,
): CostToClose {
  const courses = qualifyingCourses(catalog, config);
  const licensedRoute = config.elearningCounts ? cheapest(courses, "linkedin_learning") : null;
  const inHouseRoute = cheapest(courses, "in_house");
  const licensed = licensedById(roster);

  let total = 0;
  let unpriced = 0;
  for (const r of results) {
    if (r.status !== "AT_RISK") continue;
    const useLicensed = config.elearningCounts && licensed.get(r.employeeId) === true;
    const price = useLicensed ? licensedRoute : inHouseRoute;
    if (price === null) unpriced++;
    else total += price;
  }

  const remaining = config.budgetPhp - total;
  return {
    costToClose: total,
    unpricedCount: unpriced,
    remaining,
    covered: remaining >= 0 && unpriced === 0,
  };
}
