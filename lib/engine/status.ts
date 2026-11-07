import type { RulesConfig } from "@/lib/schemas/config";
import type { AttendanceRow, RosterRow } from "@/lib/schemas/rows";
import type { EmployeeResult, EngineRun, Status } from "./types";

export class DuplicateEmployeeIdError extends Error {
  constructor(readonly ids: string[]) {
    super(`Duplicate employee_id in roster: ${ids.join(", ")}`);
    this.name = "DuplicateEmployeeIdError";
  }
}

/** Rule 5: trainings in the year, on/before asOfDate, long enough, and allowed by delivery. */
export function countQualifying(
  rows: readonly AttendanceRow[],
  config: RulesConfig,
): number {
  const start = `${config.year}-01-01`;
  const end = `${config.year}-12-31`;
  let count = 0;
  for (const row of rows) {
    const date = row.training_date;
    if (date < start || date > end || date > config.asOfDate) continue;
    if (row.hours < config.minHours) continue;
    if (row.delivery === "elearning" && !config.elearningCounts) continue;
    count++;
  }
  return count;
}

/** Applies spec §4 rules 1-5 in order; first match wins. `rows` must be this employee's, de-duplicated. */
export function evaluateEmployee(
  emp: RosterRow,
  rows: readonly AttendanceRow[],
  config: RulesConfig,
): EmployeeResult {
  const done = (status: Status, reason: string, qualifyingCount = 0) => ({
    employeeId: emp.employee_id,
    unit: emp.unit,
    status,
    reason,
    qualifyingCount,
  });

  if (emp.hire_date > config.asOfDate) return done("NOT_COVERED", "Not yet hired as of date");
  if (emp.separation_date && emp.separation_date <= config.asOfDate) {
    return done("EXCLUDED", "Separated");
  }
  if (!config.coveredTypes.includes(emp.employment_type)) {
    return done("NOT_COVERED", "Employment type not covered");
  }
  if (emp.hire_date >= config.lateHireCutoff) return done("EXEMPT", "Late hire");

  const qualifying = countQualifying(rows, config);
  return qualifying >= 1
    ? done("COMPLIANT", "Has a qualifying training", qualifying)
    : done("AT_RISK", "No qualifying training yet", 0);
}

function assertUniqueIds(roster: readonly RosterRow[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { employee_id } of roster) {
    (seen.has(employee_id) ? dupes : seen).add(employee_id);
  }
  if (dupes.size > 0) throw new DuplicateEmployeeIdError([...dupes]);
  return seen;
}

/** Evaluates every roster row. Throws DuplicateEmployeeIdError if employee_id repeats. */
export function evaluateRoster(
  roster: readonly RosterRow[],
  attendance: readonly AttendanceRow[],
  config: RulesConfig,
): EngineRun {
  const ids = assertUniqueIds(roster);
  const byEmployee = new Map<string, AttendanceRow[]>();
  const seenRows = new Set<string>();
  let orphans = 0;
  let duplicates = 0;

  for (const row of attendance) {
    if (!ids.has(row.employee_id)) {
      orphans++;
      continue;
    }
    const key = [row.employee_id, row.training_title, row.training_date].join("\u0000");
    if (seenRows.has(key)) {
      duplicates++;
      continue;
    }
    seenRows.add(key);
    const list = byEmployee.get(row.employee_id) ?? [];
    list.push(row);
    byEmployee.set(row.employee_id, list);
  }

  return {
    results: roster.map((emp) =>
      evaluateEmployee(emp, byEmployee.get(emp.employee_id) ?? [], config),
    ),
    warnings: { orphanAttendanceRows: orphans, duplicateAttendanceRows: duplicates },
  };
}
