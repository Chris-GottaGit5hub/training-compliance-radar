import type { BudgetReport } from "./budget";
import type { BudgetOutlook } from "./commitments";

/** What The Money panel shows (spec §4.7, §6). Pesos and counts only. */
export interface MoneySummary {
  allocation: number;
  spent: number;
  /** Commitments plus the catalog estimate of the cost to close when there is no calendar. */
  promised: number;
  /** Projected year-end balance; negative when the allocation falls short. */
  left: number;
  short: boolean;
  /** Shares of the allocation, 1 decimal; leftPct is 0 when short. */
  spentPct: number;
  promisedPct: number;
  leftPct: number;
  /** Bar widths in percent: the three amounts (negative left as 0) over their total. */
  barShares: { spent: number; promised: number; left: number };
  upcomingRuns: number;
  upcomingRunsCost: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part * 1000) / whole) / 10 : 0;

export function moneySummary(budget: BudgetReport, outlook: BudgetOutlook): MoneySummary {
  const left = outlook.projectedBalance;
  const promised = round2(budget.remaining - left);
  const positiveLeft = Math.max(0, left);
  const total = budget.spent + promised + positiveLeft;
  const share = (n: number): number => (total > 0 ? (n / total) * 100 : 0);
  return {
    allocation: budget.allocation,
    spent: budget.spent,
    promised,
    left,
    short: left < 0,
    spentPct: pct(budget.spent, budget.allocation),
    promisedPct: pct(promised, budget.allocation),
    leftPct: pct(positiveLeft, budget.allocation),
    barShares: { spent: share(budget.spent), promised: share(promised), left: share(positiveLeft) },
    upcomingRuns: outlook.commitments.runs.length,
    upcomingRunsCost: outlook.commitments.calendar,
  };
}
