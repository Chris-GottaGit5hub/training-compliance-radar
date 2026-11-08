import { evaluateRoster, type EmployeeResult } from "@/lib/engine";
import type { RulesConfig } from "@/lib/schemas/config";
import type { AttendanceRow, RosterRow } from "@/lib/schemas/rows";

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface BudgetMonth {
  label: string;
  /** Cumulative actual spend at the end of the month (to the as-of date in the as-of month); null after. */
  spent: number | null;
  /** budgetPhp - spent; null after the as-of month. */
  remaining: number | null;
  /** Trained (COMPLIANT) count as of that month end; null after the as-of month. */
  trained: number | null;
  /** Cumulative actual plus planned spend (spec §4.9); null without a plan or on actual months. */
  planned: number | null;
}

export interface BudgetReport {
  allocation: number;
  spent: number;
  remaining: number;
  /** Percent of the allocation spent, 1 decimal; 0 when there is no allocation. */
  percentSpent: number;
  trained: number;
  /** spent / trained, or null when no one is trained yet. */
  costPerTrained: number | null;
  months: BudgetMonth[];
}

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const lastDay = (year: number, month: number): number =>
  [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Spend per month: roster employees only, de-duplicated, in the year and on/before the as-of date. */
function monthlySpend(
  roster: readonly RosterRow[],
  attendance: readonly AttendanceRow[],
  config: RulesConfig,
): number[] {
  const ids = new Set(roster.map((r) => r.employee_id));
  const seen = new Set<string>();
  const perMonth: number[] = Array<number>(12).fill(0);
  const start = `${config.year}-01-01`;
  const end = `${config.year}-12-31`;
  for (const row of attendance) {
    const date = row.training_date;
    if (!ids.has(row.employee_id) || date < start || date > end || date > config.asOfDate) continue;
    const key = [row.employee_id, row.training_title, date].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    perMonth[Number(date.slice(5, 7)) - 1] += row.cost;
  }
  return perMonth;
}

/**
 * Spec §4.7. `current` is the engine run at config.asOfDate (reused for the as-of month).
 * `plannedByMonth` is optional planned spend per month index 0-11 from the calendar plan.
 */
export function budgetSeries(
  roster: readonly RosterRow[],
  attendance: readonly AttendanceRow[],
  config: RulesConfig,
  current?: readonly EmployeeResult[],
  plannedByMonth?: readonly number[],
): BudgetReport {
  const now = current ?? evaluateRoster(roster, attendance, config).results;
  const perMonth = monthlySpend(roster, attendance, config);
  const asOfMonth = Number(config.asOfDate.slice(5, 7));
  const allocation = config.budgetPhp;

  let cumulative = 0;
  let plannedCumulative = 0;
  const months: BudgetMonth[] = MONTH_LABELS.map((label, i) => {
    const month = i + 1;
    if (month <= asOfMonth) {
      cumulative = round2(cumulative + perMonth[i]);
      plannedCumulative = cumulative;
      const results =
        month === asOfMonth
          ? now
          : evaluateRoster(roster, attendance, {
              ...config,
              asOfDate: `${config.year}-${String(month).padStart(2, "0")}-${lastDay(config.year, month)}`,
            }).results;
      return {
        label,
        spent: cumulative,
        remaining: round2(allocation - cumulative),
        trained: results.filter((r) => r.status === "COMPLIANT").length,
        planned: null,
      };
    }
    if (!plannedByMonth) return { label, spent: null, remaining: null, trained: null, planned: null };
    plannedCumulative = round2(plannedCumulative + (plannedByMonth[i] ?? 0));
    return { label, spent: null, remaining: null, trained: null, planned: plannedCumulative };
  });

  const trained = now.filter((r) => r.status === "COMPLIANT").length;
  return {
    allocation,
    spent: cumulative,
    remaining: round2(allocation - cumulative),
    percentSpent: allocation > 0 ? Math.round((cumulative * 1000) / allocation) / 10 : 0,
    trained,
    costPerTrained: trained > 0 ? round2(cumulative / trained) : null,
    months,
  };
}

/** ₱1.2M, ₱350K or ₱800: short money labels for chart axes. */
export function formatPesoCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}₱${+(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}₱${Math.round(abs / 1000)}K`;
  return `${sign}₱${Math.round(abs).toLocaleString("en-PH")}`;
}
