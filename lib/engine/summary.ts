import type { RulesConfig } from "@/lib/schemas/config";
import type { RosterRow } from "@/lib/schemas/rows";
import { deadlineOf, monthsRemaining } from "./dates";
import type { EmployeeResult, OrgSummary, UnitSummary } from "./types";

/** Percent 0-100, rounded half-up to 1 decimal; 0 when covered = 0 (spec §4). */
export function complianceRate(compliant: number, covered: number): number {
  if (covered === 0) return 0;
  return Math.round((compliant * 1000) / covered) / 10;
}

export function licensedById(roster: readonly RosterRow[]): Map<string, boolean> {
  return new Map(roster.map((r) => [r.employee_id, r.licensed === "yes"]));
}

/** One summary per unit that appears in the results (unranked, in first-seen order). */
export function summarizeUnits(
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
): UnitSummary[] {
  const licensed = licensedById(roster);
  const units = new Map<string, UnitSummary>();

  for (const r of results) {
    const u =
      units.get(r.unit) ??
      {
        unit: r.unit,
        covered: 0,
        compliant: 0,
        atRisk: 0,
        atRiskLicensed: 0,
        atRiskUnlicensed: 0,
        complianceRate: 0,
      };
    units.set(r.unit, u);
    if (r.status === "COMPLIANT") {
      u.covered++;
      u.compliant++;
    } else if (r.status === "AT_RISK") {
      u.covered++;
      u.atRisk++;
      if (licensed.get(r.employeeId)) u.atRiskLicensed++;
      else u.atRiskUnlicensed++;
    }
  }

  return [...units.values()].map((u) => ({
    ...u,
    complianceRate: complianceRate(u.compliant, u.covered),
  }));
}

const ratio = (u: UnitSummary): number => (u.covered === 0 ? 0 : u.compliant / u.covered);

/** atRisk desc, then unrounded compliant/covered asc, then unit name asc (code-point order). */
export function rankUnits(units: readonly UnitSummary[]): UnitSummary[] {
  return [...units].sort(
    (a, b) =>
      b.atRisk - a.atRisk ||
      ratio(a) - ratio(b) ||
      (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0),
  );
}

export function summarizeOrg(
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
  config: RulesConfig,
): OrgSummary {
  const count = (status: EmployeeResult["status"]) =>
    results.filter((r) => r.status === status).length;
  const compliant = count("COMPLIANT");
  const atRisk = count("AT_RISK");
  const covered = compliant + atRisk;

  return {
    covered,
    compliant,
    atRisk,
    exempt: count("EXEMPT"),
    excluded: count("EXCLUDED"),
    notCovered: count("NOT_COVERED"),
    complianceRate: complianceRate(compliant, covered),
    monthsRemaining: monthsRemaining(config.asOfDate),
    deadline: deadlineOf(config.year),
    unitsRanked: rankUnits(summarizeUnits(results, roster)),
  };
}
