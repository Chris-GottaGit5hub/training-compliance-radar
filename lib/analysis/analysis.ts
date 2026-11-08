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
import type { AttendanceRow, CalendarRow, CatalogRow, RosterRow } from "@/lib/schemas/rows";
import { leftOutSummary, type LeftOutItem } from "./breakdown";
import { budgetSeries, type BudgetReport } from "./budget";
import { budgetOutlook, buildCommitments, type BudgetOutlook } from "./commitments";
import { buildPlan, type Plan } from "./plan";
import {
  planSectorWindows,
  recommendedCourse,
  scheduleUnits,
  windowStatus,
  type WindowPlan,
  type WindowRow,
} from "./windows";

export interface AnalysisInput {
  roster: readonly RosterRow[];
  attendance: readonly AttendanceRow[];
  /** null when no catalog was uploaded: cost-to-close is then unavailable. */
  catalog: readonly CatalogRow[] | null;
  /** Optional planned runs (spec §4.9). */
  calendar?: readonly CalendarRow[] | null;
  config: RulesConfig;
}

/** Sector windows for the recommended course (spec §4.8). */
export interface WindowSection {
  course: CatalogRow;
  plan: WindowPlan;
  rows: WindowRow[];
}

export interface BacktestCheckpoint {
  label: string;
  checkpoint: string;
  result: BacktestResult;
}

export interface Analysis {
  results: EmployeeResult[];
  org: OrgSummary;
  /** Cost to close the gap; `remaining` is the projected year-end balance (spec §4.2, §4.7). */
  cost: CostToClose | null;
  /** "plan" = cheapest combination of calendar runs, nominated external and LinkedIn; "catalog" = per-head estimate. */
  costSource: "plan" | "catalog" | null;
  /** Recall and precision at Jun 30 and Sep 30 of config.year (spec §4.1). */
  backtests: BacktestCheckpoint[];
  /** Trained vs untrained against the four target dates (spec §4.5). */
  milestones: MilestoneResult[];
  /** Annual allocation burn-down (spec §4.7). */
  budget: BudgetReport;
  /** Commitments and the projected year-end balance (spec §4.7). */
  outlook: BudgetOutlook;
  /** Who is outside the rule and why (spec §6). */
  leftOut: LeftOutItem[];
  /** null without a recommended course or sector column. */
  windows: WindowSection | null;
  /** null without a calendar or recommended-course windows. */
  plan: Plan | null;
  warnings: EngineWarnings;
}

export interface AtRiskRow {
  employeeId: string;
  /** The unique 5-digit Personnel Number, when the roster has one. */
  personnelNumber?: string;
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
export function runAnalysis({ roster, attendance, catalog, calendar, config }: AnalysisInput): Analysis {
  const { results, warnings } = evaluateRoster(roster, attendance, config);

  const scheme = scheduleUnits(results, roster);
  const course = recommendedCourse(catalog);
  const windowPlan = course && scheme.units.length > 0 ? planSectorWindows(scheme.units, config) : null;
  const windows: WindowSection | null =
    course && windowPlan
      ? {
          course,
          plan: windowPlan,
          rows: windowStatus(windowPlan.windows, scheme, course, results, roster, attendance, config.asOfDate),
        }
      : null;
  const plan =
    windows || (calendar && calendar.length > 0)
      ? buildPlan(
          results,
          roster,
          catalog ?? [],
          calendar ?? [],
          config,
          windowPlan ? { windows: windowPlan.windows, label: scheme.label } : null,
        )
      : null;

  // Commitments: every future calendar run, expected external nominations, paid LinkedIn fees.
  const commitments = buildCommitments(calendar ?? [], plan, roster, attendance, config);
  const budget = budgetSeries(roster, attendance, config, results, commitments.byMonth);
  const baseCost = catalog && catalog.length > 0 ? costToClose(results, roster, catalog, config) : null;
  // With a calendar, the cost is the plan's cheapest combination; otherwise a per-head estimate.
  const fromPlan = plan !== null && calendar !== undefined && calendar !== null && calendar.length > 0;
  const priced = fromPlan && plan ? { costToClose: plan.totalPlannedCost, unpricedCount: plan.unplaced } : baseCost;
  // The plan's costs already sit inside the commitments; a catalog estimate does not.
  const outlook = budgetOutlook(budget, commitments, fromPlan ? 0 : (priced?.costToClose ?? 0));
  const cost: CostToClose | null = priced
    ? {
        costToClose: priced.costToClose,
        unpricedCount: priced.unpricedCount,
        remaining: outlook.projectedBalance,
        covered: outlook.projectedBalance >= 0 && priced.unpricedCount === 0,
      }
    : null;

  return {
    results,
    org: summarizeOrg(results, roster, config),
    cost,
    costSource: priced === null ? null : fromPlan ? "plan" : "catalog",
    backtests: CHECKPOINTS.map(({ label, monthDay }) => {
      const checkpoint = `${config.year}-${monthDay}`;
      return { label, checkpoint, result: backtest(roster, attendance, config, checkpoint) };
    }),
    milestones: evaluateMilestones(roster, attendance, config, results),
    budget,
    outlook,
    leftOut: leftOutSummary(results, roster),
    windows,
    plan,
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
      personnelNumber: emp.personnel_number,
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
