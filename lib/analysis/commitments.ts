import type { RulesConfig } from "@/lib/schemas/config";
import type { AttendanceRow, CalendarRow, RosterRow } from "@/lib/schemas/rows";
import type { BudgetReport } from "./budget";
import { resolveRun, runCost } from "./costing";
import type { Plan } from "./plan";

/** One calendar run still to come, budgeted at its expected enrolment. */
export interface CommittedRun {
  runId: string;
  title: string;
  date: string;
  delivery: CalendarRow["delivery"];
  people: number;
  cost: number;
}

/** Money already promised after the as-of date (spec §4.7). Pesos only, no employee IDs. */
export interface Commitments {
  runs: CommittedRun[];
  /** Every future calendar run, whether or not it is needed to close the gap. */
  calendar: number;
  /** External trainings people nominate that are not in the calendar. */
  nominations: number;
  /** True when `nominations` is the run-rate estimate rather than a figure from Rules. */
  nominationsEstimated: boolean;
  /** Fees for unlicensed staff on paid LinkedIn courses (only with a calendar). */
  linkedIn: number;
  total: number;
  /** Committed spend by month index 0-11; never in or before the as-of month. */
  byMonth: number[];
}

export interface BudgetOutlook {
  commitments: Commitments;
  /** budgetPhp - spent - commitments (- cost to close when it is the catalog estimate). */
  projectedBalance: number;
  /** Projected balance as a percent of the allocation, 1 decimal; 0 without an allocation. */
  projectedPct: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Cautious run-rate: external attendance cost so far, per month, times the months left. */
function estimateNominations(
  roster: readonly RosterRow[],
  attendance: readonly AttendanceRow[],
  config: RulesConfig,
  asOfMonth: number,
): number {
  const ids = new Set(roster.map((r) => r.employee_id));
  const seen = new Set<string>();
  let external = 0;
  for (const row of attendance) {
    const date = row.training_date;
    if (row.delivery !== "external" || !ids.has(row.employee_id)) continue;
    if (!date.startsWith(`${config.year}-`) || date > config.asOfDate) continue;
    const key = [row.employee_id, row.training_title, date].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    external += row.cost;
  }
  return round2((external / asOfMonth) * (12 - asOfMonth));
}

/**
 * Spec §4.7. Future calendar runs are budgeted at max(expected enrolment, people the plan
 * places in them). Nominations come from Rules or the run-rate estimate. LinkedIn fees count
 * only when a calendar is loaded (otherwise the catalog estimate covers them).
 */
export function buildCommitments(
  calendar: readonly CalendarRow[],
  plan: Plan | null,
  roster: readonly RosterRow[],
  attendance: readonly AttendanceRow[],
  config: RulesConfig,
): Commitments {
  const asOfMonth = Number(config.asOfDate.slice(5, 7));
  const cutoff = `${config.year}-12-14`;
  const nov30 = `${config.year}-11-30`;
  const byMonth = Array<number>(12).fill(0);
  // Nothing lands in or before the as-of month: actuals already cover it.
  const place = (monthIdx: number, amount: number) => {
    byMonth[Math.min(11, Math.max(monthIdx, asOfMonth))] += amount;
  };

  const planned = new Map((plan?.runs ?? []).map((r) => [r.runId, r.participants]));
  const runs: CommittedRun[] = calendar
    .filter((r) => r.date > config.asOfDate && r.date <= cutoff && r.date.startsWith(`${config.year}-`))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.run_id < b.run_id ? -1 : 1))
    .map((run) => {
      const resolved = resolveRun(run);
      const people = Math.max(resolved.expectedPax, planned.get(run.run_id) ?? 0);
      return {
        runId: run.run_id,
        title: run.run_title ?? run.course_id,
        date: run.date,
        delivery: run.delivery,
        people,
        cost: runCost(resolved, people),
      };
    });
  for (const r of runs) place(Number(r.date.slice(5, 7)) - 1, r.cost);

  const estimated = config.nominationReservePhp === undefined;
  const nominations = round2(config.nominationReservePhp ?? estimateNominations(roster, attendance, config, asOfMonth));
  const months = asOfMonth < 12 ? 12 - asOfMonth : 1;
  for (let i = 0; i < months; i++) place(asOfMonth < 12 ? asOfMonth + i : 11, nominations / months);

  const linkedIn = calendar.length > 0 ? (plan?.linkedInCost ?? 0) : 0;
  place(nov30 > config.asOfDate ? 10 : 11, linkedIn);

  const calendarTotal = round2(runs.reduce((sum, r) => sum + r.cost, 0));
  return {
    runs,
    calendar: calendarTotal,
    nominations,
    nominationsEstimated: estimated,
    linkedIn,
    total: round2(calendarTotal + nominations + linkedIn),
    byMonth: byMonth.map(round2),
  };
}

/** Spec §4.7 outlook. `catalogEstimate` is the cost to close when no calendar prices it. */
export function budgetOutlook(
  budget: BudgetReport,
  commitments: Commitments,
  catalogEstimate: number,
): BudgetOutlook {
  const projectedBalance = round2(budget.remaining - commitments.total - catalogEstimate);
  return {
    commitments,
    projectedBalance,
    projectedPct:
      budget.allocation > 0 ? Math.round((projectedBalance * 1000) / budget.allocation) / 10 : 0,
  };
}
