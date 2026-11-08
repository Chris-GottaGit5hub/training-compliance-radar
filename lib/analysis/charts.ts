import type { CostToClose, OrgSummary } from "@/lib/engine";
import type { BacktestCheckpoint } from "./analysis";

/** Statuses in the order they are drawn and listed. */
export const STATUS_SERIES = [
  { key: "compliant", label: "Compliant" },
  { key: "atRisk", label: "At risk" },
  { key: "exempt", label: "Exempt" },
  { key: "excluded", label: "Excluded" },
  { key: "notCovered", label: "Not covered" },
] as const;

export type StatusKey = (typeof STATUS_SERIES)[number]["key"];

export interface StatusSlice {
  key: StatusKey;
  label: string;
  value: number;
  /** Share of all employees in the roster, 1 decimal. */
  percent: number;
}

/** Everyone in the roster split by status (the five statuses add up to the roster size). */
export function statusBreakdown(org: OrgSummary): StatusSlice[] {
  const total = STATUS_SERIES.reduce((sum, s) => sum + org[s.key], 0);
  return STATUS_SERIES.map(({ key, label }) => ({
    key,
    label,
    value: org[key],
    percent: total === 0 ? 0 : Math.round((org[key] * 1000) / total) / 10,
  }));
}

export interface UnitBar {
  unit: string;
  atRisk: number;
  complianceRate: number;
}

/** Units with at-risk staff, in the dashboard's ranking order, at most `limit`. */
export function topAtRiskUnits(org: OrgSummary, limit = 6): UnitBar[] {
  return org.unitsRanked
    .filter((u) => u.atRisk > 0)
    .slice(0, limit)
    .map(({ unit, atRisk, complianceRate }) => ({ unit, atRisk, complianceRate }));
}

export interface BacktestBars {
  checkpoint: string;
  /** Whole percent 0-100, or null when undefined (no one to measure). */
  recall: number | null;
  precision: number | null;
}

const toPercent = (ratio: number | null): number | null =>
  ratio === null ? null : Math.round(ratio * 100);

export function backtestSeries(backtests: readonly BacktestCheckpoint[]): BacktestBars[] {
  return backtests.map(({ label, result }) => ({
    checkpoint: label,
    recall: toPercent(result.recall),
    precision: toPercent(result.precision),
  }));
}

export interface CostBar {
  key: "cost" | "budget";
  label: string;
  value: number;
}

/**
 * Cost to close, plus the budget still available (allocation minus spend) when a budget is set;
 * null when there is nothing to price from.
 */
export function costBars(cost: CostToClose | null, budgetLeft: number | null): CostBar[] | null {
  if (!cost) return null;
  const bars: CostBar[] = [{ key: "cost", label: "Cost to close", value: cost.costToClose }];
  if (budgetLeft !== null) bars.push({ key: "budget", label: "Budget left", value: budgetLeft });
  return bars;
}
