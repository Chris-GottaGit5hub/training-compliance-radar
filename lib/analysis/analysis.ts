import {
  backtest,
  costToClose,
  evaluateMilestones,
  evaluateRoster,
  summarizeOrg,
  type BacktestResult,
  type CostToClose,
  type EmployeeResult,
  type EngineWarnings,
  type MilestoneResult,
  type OrgSummary,
} from "@/lib/engine";
import type { RulesConfig } from "@/lib/schemas/config";
import { budgetSeries, type BudgetReport } from "./budget";
import type { AttendanceRow, CatalogRow, RosterRow } from "@/lib/schemas/rows";

export interface AnalysisInput {
  roster: readonly RosterRow[];
  attendance: readonly AttendanceRow[];
  /** null when no catalog was uploaded: cost-to-close is then unavailable. */
  catalog: readonly CatalogRow[] | null;
  config: RulesConfig;
}

export interface BacktestCheckpoint {
  label: string;
  checkpoint: string;
  result: BacktestResult;
}

export interface Analysis {
  results: EmployeeResult[];
  org: OrgSummary;
  cost: CostToClose | null;
  /** Recall and precision at Jun 30 and Sep 30 of config.year (spec §4.1). */
  backtests: BacktestCheckpoint[];
  /** Trained vs untrained against the four target dates (spec §4.5). */
  milestones: MilestoneResult[];
  /** Annual allocation burn-down (spec §4.7). */
  budget: BudgetReport;
  warnings: EngineWarnings;
}

export interface AtRiskRow {
  employeeId: string;
  name: string;
  unit: string;
  position: string;
  employmentType: string;
  licensed: boolean;
  hireDate: string;
}

const CHECKPOINTS = [
  { label: "Jun 30", monthDay: "06-30" },
  { label: "Sep 30", monthDay: "09-30" },
] as const;

/** Runs the whole engine once for the dashboard. Pure; throws only on duplicate employee_id. */
export function runAnalysis({ roster, attendance, catalog, config }: AnalysisInput): Analysis {
  const { results, warnings } = evaluateRoster(roster, attendance, config);
  return {
    results,
    org: summarizeOrg(results, roster, config),
    cost: catalog && catalog.length > 0 ? costToClose(results, roster, catalog, config) : null,
    backtests: CHECKPOINTS.map(({ label, monthDay }) => {
      const checkpoint = `${config.year}-${monthDay}`;
      return { label, checkpoint, result: backtest(roster, attendance, config, checkpoint) };
    }),
    milestones: evaluateMilestones(roster, attendance, config, results),
    budget: budgetSeries(roster, attendance, config, results),
    warnings,
  };
}

const byUnitThenName = (a: AtRiskRow, b: AtRiskRow): number =>
  a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** AT_RISK employees joined with roster details; one unit, or every unit when `unit` is omitted. */
export function atRiskEmployees(
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
  unit?: string,
): AtRiskRow[] {
  const byId = new Map(roster.map((r) => [r.employee_id, r]));
  const rows: AtRiskRow[] = [];
  for (const result of results) {
    if (result.status !== "AT_RISK" || (unit !== undefined && result.unit !== unit)) continue;
    const emp = byId.get(result.employeeId);
    if (!emp) continue;
    rows.push({
      employeeId: emp.employee_id,
      name: emp.name,
      unit: emp.unit,
      position: emp.position,
      employmentType: emp.employment_type,
      licensed: emp.licensed === "yes",
      hireDate: emp.hire_date,
    });
  }
  return rows.sort(byUnitThenName);
}
