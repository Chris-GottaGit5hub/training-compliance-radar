import { BANDS, complianceRate, payGradeBand, type EmployeeResult } from "@/lib/engine";
import type { RosterRow } from "@/lib/schemas/rows";

export const DIMENSIONS = [
  { key: "band", label: "Pay-grade band" },
  { key: "payGrade", label: "Pay grade" },
  { key: "unit", label: "Department" },
  { key: "group", label: "Group" },
  { key: "sector", label: "Sector" },
] as const;

export type Dimension = (typeof DIMENSIONS)[number]["key"];
export type BreakdownFilter = Partial<Record<Dimension, string>>;

export const UNASSIGNED = "Unassigned";

const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

/** The value an employee has on one dimension (spec §4.6). */
export function dimensionValue(emp: RosterRow, dimension: Dimension): string {
  switch (dimension) {
    case "band":
      return payGradeBand(emp.pay_grade);
    case "payGrade":
      return emp.pay_grade === undefined ? UNASSIGNED : `PG ${emp.pay_grade}`;
    case "unit":
      return emp.unit;
    case "group":
      return emp.group ?? UNASSIGNED;
    case "sector":
      return emp.sector ?? UNASSIGNED;
  }
}

/** Dimensions the roster actually fills in (department is always there). */
export function availableDimensions(roster: readonly RosterRow[]): Dimension[] {
  const filled: Record<Dimension, boolean> = {
    band: roster.some((r) => r.pay_grade !== undefined),
    payGrade: roster.some((r) => r.pay_grade !== undefined),
    unit: true,
    group: roster.some((r) => r.group !== undefined),
    sector: roster.some((r) => r.sector !== undefined),
  };
  return DIMENSIONS.map((d) => d.key).filter((key) => filled[key]);
}

/** Distinct values of a dimension for slicer menus, in a natural order. */
export function dimensionValues(roster: readonly RosterRow[], dimension: Dimension): string[] {
  const values = [...new Set(roster.map((r) => dimensionValue(r, dimension)))];
  if (dimension === "band") return BANDS.filter((b) => values.includes(b));
  return values.sort(natural);
}

export interface LeftOutItem {
  label: string;
  count: number;
}

/**
 * Who the rule does not cover as of the as-of date, and why (spec §6). Counts only.
 * Order: separated, not yet hired, employment types not covered, late hires.
 */
export function leftOutSummary(
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
): LeftOutItem[] {
  const byId = new Map(roster.map((r) => [r.employee_id, r]));
  const counts = new Map<string, number>();
  const add = (label: string) => counts.set(label, (counts.get(label) ?? 0) + 1);
  for (const r of results) {
    if (r.status === "EXCLUDED") add("separated");
    else if (r.status === "EXEMPT") add("late hires (exempt)");
    else if (r.status === "NOT_COVERED") {
      const type = byId.get(r.employeeId)?.employment_type ?? "unknown";
      add(r.reason === "Not yet hired as of date" ? "not yet hired" : `${type} staff (type not covered)`);
    }
  }
  const rank = (label: string): number =>
    label === "separated" ? 0 : label === "not yet hired" ? 1 : label.endsWith("(exempt)") ? 3 : 2;
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => rank(a.label) - rank(b.label) || natural(a.label, b.label));
}

export interface BreakdownRow {
  key: string;
  inScope: number;
  trained: number;
  untrained: number;
  /** Trained share, percent rounded to 1 decimal. */
  rate: number;
}

/**
 * Trained vs untrained for COMPLIANT and AT_RISK employees, grouped by `dimension`
 * after keeping only those matching every entry in `filter`. Sorted by untrained
 * desc, then rate asc, then key.
 */
export function breakdown(
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
  dimension: Dimension,
  filter: BreakdownFilter = {},
): BreakdownRow[] {
  const byId = new Map(roster.map((r) => [r.employee_id, r]));
  const filters = Object.entries(filter).filter(([, v]) => v) as [Dimension, string][];
  const groups = new Map<string, { trained: number; untrained: number }>();

  for (const result of results) {
    if (result.status !== "COMPLIANT" && result.status !== "AT_RISK") continue;
    const emp = byId.get(result.employeeId);
    if (!emp || filters.some(([dim, value]) => dimensionValue(emp, dim) !== value)) continue;
    const key = dimensionValue(emp, dimension);
    const g = groups.get(key) ?? { trained: 0, untrained: 0 };
    if (result.status === "COMPLIANT") g.trained++;
    else g.untrained++;
    groups.set(key, g);
  }

  return [...groups.entries()]
    .map(([key, g]) => {
      const inScope = g.trained + g.untrained;
      return { key, inScope, ...g, rate: complianceRate(g.trained, inScope) };
    })
    .sort((a, b) => b.untrained - a.untrained || a.rate - b.rate || natural(a.key, b.key));
}
