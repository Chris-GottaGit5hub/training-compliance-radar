import { describe, expect, it } from "vitest";
import {
  STATUS_SERIES,
  backtestSeries,
  costBars,
  statusBreakdown,
  topAtRiskUnits,
  type BacktestCheckpoint,
} from "@/lib/analysis";
import type { OrgSummary } from "@/lib/engine";
import { unitSummary } from "./helpers/fixtures";

const org = (overrides: Partial<OrgSummary> = {}): OrgSummary => ({
  covered: 8,
  compliant: 5,
  atRisk: 3,
  exempt: 1,
  excluded: 2,
  notCovered: 4,
  complianceRate: 62.5,
  monthsRemaining: 3,
  deadline: "2026-12-31",
  unitsRanked: [],
  ...overrides,
});

describe("statusBreakdown", () => {
  it("lists the five statuses in order with counts that add up to the roster", () => {
    const slices = statusBreakdown(org());
    expect(slices.map((s) => s.key)).toEqual(STATUS_SERIES.map((s) => s.key));
    expect(slices.map((s) => s.value)).toEqual([5, 3, 1, 2, 4]);
    expect(slices.reduce((sum, s) => sum + s.value, 0)).toBe(15);
  });

  it("gives each status its share of all employees, to one decimal", () => {
    const slices = statusBreakdown(org());
    expect(slices.find((s) => s.key === "compliant")?.percent).toBe(33.3); // 5 of 15
    expect(slices.find((s) => s.key === "atRisk")?.percent).toBe(20);
  });

  it("returns zero shares for an empty roster", () => {
    const empty = org({ compliant: 0, atRisk: 0, exempt: 0, excluded: 0, notCovered: 0, covered: 0 });
    expect(statusBreakdown(empty).every((s) => s.percent === 0)).toBe(true);
  });
});

describe("topAtRiskUnits", () => {
  const ranked = [
    unitSummary("A", 5, 9),
    unitSummary("B", 5, 7),
    unitSummary("C", 9, 0), // nobody at risk: left out
    unitSummary("D", 5, 3),
  ];

  it("keeps the dashboard's order and drops units with nobody at risk", () => {
    const bars = topAtRiskUnits(org({ unitsRanked: ranked }));
    expect(bars.map((b) => b.unit)).toEqual(["A", "B", "D"]);
    expect(bars[0]).toEqual({ unit: "A", atRisk: 9, complianceRate: 0 });
  });

  it("limits the number of bars", () => {
    expect(topAtRiskUnits(org({ unitsRanked: ranked }), 2).map((b) => b.unit)).toEqual(["A", "B"]);
  });
});

describe("backtestSeries", () => {
  const point = (label: string, recall: number | null, precision: number | null): BacktestCheckpoint => ({
    label,
    checkpoint: "2026-06-30",
    result: {
      flaggedAtCheckpoint: 0,
      nonCompliantAtYearEnd: 0,
      caughtEarly: 0,
      notCoveredAtCheckpoint: 0,
      recall,
      precision,
    },
  });

  it("converts ratios to whole percents and keeps null as null", () => {
    expect(backtestSeries([point("Jun 30", 0.5714, 0.248), point("Sep 30", null, null)])).toEqual([
      { checkpoint: "Jun 30", recall: 57, precision: 25 },
      { checkpoint: "Sep 30", recall: null, precision: null },
    ]);
  });
});

describe("costBars", () => {
  const cost = { costToClose: 3850, unpricedCount: 0, remaining: 46150, covered: true };

  it("is null without a catalog", () => {
    expect(costBars(null, 50_000)).toBeNull();
  });

  it("shows the budget bar only when a budget is set", () => {
    expect(costBars(cost, 0)?.map((b) => b.key)).toEqual(["cost"]);
    expect(costBars(cost, 50_000)).toEqual([
      { key: "cost", label: "Cost to close", value: 3850 },
      { key: "budget", label: "Budget", value: 50_000 },
    ]);
  });
});
