import type { EmployeeResult, Status, UnitSummary } from "@/lib/engine";
import type { AttendanceRow, CatalogRow, RosterRow, RulesConfig } from "@/lib/schemas";

export const ROSTER_HEADER =
  "employee_id,name,unit,position,employment_type,hire_date,separation_date,licensed";
export const ATTENDANCE_HEADER =
  "employee_id,training_title,training_date,hours,delivery,cost";
export const CATALOG_HEADER =
  "course_id,title,skill_area,duration_minutes,provider,url,cost_per_head";

/** Base rules: 2026, as of Sep 30, late-hire cutoff Oct 1, everything covered. */
export function config(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return {
    year: 2026,
    asOfDate: "2026-09-30",
    lateHireCutoff: "2026-10-01",
    coveredTypes: ["regular", "contractual"],
    elearningCounts: true,
    minHours: 1,
    budgetPhp: 0,
    milestoneTargets: [25, 50, 85, 100],
    ...overrides,
  };
}

export function emp(id: string, overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    employee_id: id,
    name: `Name ${id}`,
    unit: "Unit A",
    position: "Officer",
    employment_type: "regular",
    hire_date: "2020-01-01",
    licensed: "yes",
    ...overrides,
  };
}

export function att(
  id: string,
  date: string,
  overrides: Partial<AttendanceRow> = {},
): AttendanceRow {
  return {
    employee_id: id,
    training_title: "Training",
    training_date: date,
    hours: 8,
    delivery: "classroom",
    cost: 0,
    ...overrides,
  };
}

export function course(
  id: string,
  provider: CatalogRow["provider"],
  minutes: number,
  cost: number,
): CatalogRow {
  return {
    course_id: id,
    title: id,
    skill_area: "General",
    duration_minutes: minutes,
    provider,
    cost_per_head: cost,
  };
}

export function result(
  id: string,
  unit: string,
  status: Status,
): EmployeeResult {
  return { employeeId: id, unit, status, reason: "", qualifyingCount: 0 };
}

export function unitSummary(
  unit: string,
  compliant: number,
  atRisk: number,
): UnitSummary {
  return {
    unit,
    covered: compliant + atRisk,
    compliant,
    atRisk,
    atRiskLicensed: atRisk,
    atRiskUnlicensed: 0,
    complianceRate: 0,
  };
}
