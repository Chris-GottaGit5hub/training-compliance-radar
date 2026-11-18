import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initialConfigFor, moneySummary, runAnalysis, type BudgetOutlook, type BudgetReport } from "@/lib/analysis";
import { validateCsv } from "@/lib/schemas";

const report = (allocation: number, spent: number): BudgetReport => ({
  allocation,
  spent,
  remaining: allocation - spent,
  percentSpent: allocation > 0 ? Math.round((spent * 1000) / allocation) / 10 : 0,
  trained: 0,
  costPerTrained: null,
  subscriptions: 0,
  months: [],
});

const outlook = (projectedBalance: number, calendar = 0, runs = 0): BudgetOutlook => ({
  commitments: {
    runs: Array.from({ length: runs }, (_, i) => ({
      runId: `R${i}`, title: `Run ${i}`, date: "2026-10-15", delivery: "in_house" as const, people: 10, cost: calendar / runs,
    })),
    calendar,
    nominations: 0,
    nominationsEstimated: false,
    linkedIn: 0,
    total: calendar,
    byMonth: Array(12).fill(0),
  },
  projectedBalance,
  projectedPct: 0,
});

describe("moneySummary (spec §4.7, The Money panel)", () => {
  it("splits the allocation into spent, promised and left, with shares to 1 decimal", () => {
    const m = moneySummary(report(100_000_000, 72_524_250), outlook(7_042_250, 4_752_000, 17));
    expect(m).toMatchObject({
      allocation: 100_000_000,
      spent: 72_524_250,
      promised: 20_433_500,
      left: 7_042_250,
      spentPct: 72.5,
      promisedPct: 20.4,
      leftPct: 7,
      upcomingRuns: 17,
      upcomingRunsCost: 4_752_000,
      short: false,
    });
    expect(m.spent + m.promised + m.left).toBe(m.allocation);
  });

  it("counts the catalog estimate of the cost to close as promised when there is no calendar", () => {
    // remaining 40,000; commitments 10,000; projected 25,000 => 5,000 is the catalog estimate.
    const m = moneySummary(report(100_000, 60_000), outlook(25_000, 10_000, 2));
    expect(m.promised).toBe(15_000);
    expect(m.upcomingRuns).toBe(2);
  });

  it("flags a shortfall, keeps leftPct at 0 and still fills the bar", () => {
    const m = moneySummary(report(100_000, 90_000), outlook(-20_000, 30_000, 1));
    expect(m.short).toBe(true);
    expect(m.left).toBe(-20_000);
    expect(m.leftPct).toBe(0);
    expect(m.barShares.left).toBe(0);
    expect(m.barShares.spent + m.barShares.promised).toBeCloseTo(100, 5);
    expect(m.barShares.spent).toBeCloseTo(75, 5); // 90,000 of 120,000
  });

  it("returns zero shares without an allocation", () => {
    const m = moneySummary(report(0, 0), outlook(0));
    expect([m.spentPct, m.promisedPct, m.leftPct]).toEqual([0, 0, 0]);
    expect(m.barShares).toEqual({ spent: 0, promised: 0, left: 0 });
  });

  it("matches the dashboard numbers for the 12,000-employee sample", () => {
    const load = <K extends "roster" | "attendance" | "catalog" | "calendar">(kind: K) => {
      const r = validateCsv(kind, readFileSync(path.resolve(process.cwd(), "public/sample", `${kind}.csv`), "utf8"));
      if (!r.ok) throw new Error(kind);
      return r.rows;
    };
    const roster = load("roster");
    const config = initialConfigFor("sample", roster, "2026-11-18");
    const analysis = runAnalysis({ roster, attendance: load("attendance"), catalog: load("catalog"), calendar: load("calendar"), config } as never);
    const m = moneySummary(analysis.budget, analysis.outlook);
    expect(m.allocation).toBe(100_000_000);
    expect(m.left).toBe(analysis.outlook.projectedBalance);
    expect(m.leftPct).toBe(analysis.outlook.projectedPct);
    expect(m.spent + m.promised + m.left).toBeCloseTo(m.allocation, 2);
    expect(m.upcomingRunsCost).toBe(analysis.outlook.commitments.calendar);
  });
});
