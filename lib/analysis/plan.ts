import { MILESTONE_POINTS, qualifyingCourses, type EmployeeResult } from "@/lib/engine";
import type { RulesConfig } from "@/lib/schemas/config";
import type { CalendarRow, CatalogRow, RosterRow } from "@/lib/schemas/rows";
import type { ScheduleScheme, SectorWindow } from "./windows";

export interface PlanRun {
  runId: string;
  date: string;
  delivery: CalendarRow["delivery"];
  participants: number;
  cost: number;
  state: "held" | "cancelled";
  reason?: string;
}

export interface PlanMilestone {
  label: string;
  date: string;
  projected: number;
  targetTrained: number;
  /** projected - targetTrained; negative means the plan falls short. */
  gap: number;
}

export interface Plan {
  runs: PlanRun[];
  licensedLinkedIn: number;
  paidLinkedIn: number;
  /** Cannot close by the deadline without a license or another run. */
  unplaced: number;
  runsCost: number;
  linkedInCost: number;
  totalPlannedCost: number;
  /** Planned spend by month index 0-11 (runs on their date, LinkedIn on Nov 30). */
  plannedByMonth: number[];
  milestones: PlanMilestone[];
}

export interface PlanSchedule {
  windows: readonly SectorWindow[];
  label: ScheduleScheme["label"];
}

const monthIndex = (date: string): number => Number(date.slice(5, 7)) - 1;
const byDateThenId = (a: CalendarRow, b: CalendarRow): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Spec §4.9. Licensed at-risk staff close through LinkedIn at the cheapest qualifying
 * price (normally 0); unlicensed staff fill calendar runs (cancelled below min_pax, none
 * after Dec 14, none costlier per head than the cheapest paid LinkedIn fee), then take
 * that fee, else they are unplaced. Assumes everyone placed completes. Counts and pesos
 * only, no employee IDs.
 */
export function buildPlan(
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
  catalog: readonly CatalogRow[],
  calendar: readonly CalendarRow[],
  config: RulesConfig,
  schedule?: PlanSchedule | null,
): Plan {
  const byId = new Map(roster.map((r) => [r.employee_id, r]));
  const linkedin = qualifyingCourses(catalog, config).filter((c) => c.provider === "linkedin_learning");
  const canLinkedIn = config.elearningCounts && linkedin.length > 0;
  const licensedPrice = canLinkedIn ? Math.min(...linkedin.map((c) => c.cost_per_head)) : 0;
  const fees = linkedin.flatMap((c) => (c.unlicensed_fee === undefined ? [] : [c.unlicensed_fee]));
  const paidFee = config.elearningCounts && fees.length > 0 ? Math.min(...fees) : null;
  const cutoff = `${config.year}-12-14`;
  const nov30 = `${config.year}-11-30`;

  const atRisk = results
    .filter((r) => r.status === "AT_RISK")
    .flatMap((r) => (byId.has(r.employeeId) ? [byId.get(r.employeeId) as RosterRow] : []));
  const licensed = canLinkedIn ? atRisk.filter((e) => e.licensed === "yes") : [];
  const pool = atRisk.filter((e) => !(canLinkedIn && e.licensed === "yes")).map((e) => e.employee_id);

  const plannedByMonth = Array<number>(12).fill(0);
  const runs: PlanRun[] = [];
  const held: { date: string; participants: number }[] = [];
  const upcoming = calendar
    .filter((r) => r.date > config.asOfDate && r.date.startsWith(`${config.year}-`))
    .sort(byDateThenId);

  for (const run of upcoming) {
    const base = { runId: run.run_id, date: run.date, delivery: run.delivery, participants: 0, cost: 0 };
    if (run.date > cutoff) {
      runs.push({ ...base, state: "cancelled", reason: "after the Dec 14 in-person cutoff" });
    } else if (paidFee !== null && (run.cost_per_run ?? 0) / run.max_pax + run.cost_per_head > paidFee) {
      const perHead = Math.round((run.cost_per_run ?? 0) / run.max_pax + run.cost_per_head);
      runs.push({ ...base, state: "cancelled", reason: `costlier than paid LinkedIn (₱${perHead} vs ₱${paidFee} per head)` });
    } else if (pool.length < run.min_pax) {
      runs.push({ ...base, state: "cancelled", reason: `fewer than ${run.min_pax} people available` });
    } else {
      const take = Math.min(run.max_pax, pool.length);
      pool.splice(0, take);
      const cost = round2((run.cost_per_run ?? 0) + run.cost_per_head * take);
      plannedByMonth[monthIndex(run.date)] += cost;
      held.push({ date: run.date, participants: take });
      runs.push({ ...base, participants: take, cost, state: "held" });
    }
  }

  const paidLinkedIn = paidFee === null ? 0 : pool.length;
  const unplaced = paidFee === null ? pool.length : 0;
  const linkedInCost = round2(licensed.length * licensedPrice + paidLinkedIn * (paidFee ?? 0));
  plannedByMonth[10] += linkedInCost;
  const runsCost = round2(runs.reduce((sum, r) => sum + r.cost, 0));

  const windowEnd = new Map((schedule?.windows ?? []).map((w) => [w.unit, w.end]));
  const closeDates = licensed.map((e) => {
    const end = schedule ? windowEnd.get(schedule.label(e)) : undefined;
    return end !== undefined && end > config.asOfDate ? end : nov30;
  });
  const trainedNow = results.filter((r) => r.status === "COMPLIANT").length;
  const scoped = trainedNow + atRisk.length;

  const milestones = MILESTONE_POINTS.flatMap(({ monthDay, label }, k) => {
    const date = `${config.year}-${monthDay}`;
    if (date <= config.asOfDate) return [];
    const projected =
      trainedNow +
      held.filter((h) => h.date <= date).reduce((sum, h) => sum + h.participants, 0) +
      closeDates.filter((d) => d <= date).length +
      (date >= nov30 ? paidLinkedIn : 0);
    const targetTrained = Math.ceil(((config.milestoneTargets[k] ?? 0) * scoped) / 100 - 1e-9);
    return [{ label, date, projected, targetTrained, gap: projected - targetTrained }];
  });

  return {
    runs,
    licensedLinkedIn: licensed.length,
    paidLinkedIn,
    unplaced,
    runsCost,
    linkedInCost,
    totalPlannedCost: round2(runsCost + linkedInCost),
    plannedByMonth,
    milestones,
  };
}
