import { describe, expect, it } from "vitest";
import { SAMPLE_BUDGET_PHP, budgetSeries, formatPesoCompact, initialConfigFor } from "@/lib/analysis";
import { att, config, emp } from "./helpers/fixtures";

const roster = [emp("A"), emp("B"), emp("C")];
const attendance = [
  att("A", "2026-01-20", { cost: 1000 }),
  att("B", "2026-03-05", { cost: 2500.5 }),
  att("A", "2026-03-20", { cost: 500, training_title: "Second" }),
  att("C", "2026-05-10", { cost: 4000 }),
  att("C", "2026-08-01", { cost: 9999 }), // after the as-of date: not spent yet
];
const cfg = config({ asOfDate: "2026-05-31", budgetPhp: 100_000 });

describe("budgetSeries", () => {
  const report = budgetSeries(roster, attendance, cfg);

  it("accumulates actual spend by month up to the as-of date", () => {
    expect(report.months.map((m) => m.spent)).toEqual([
      1000, 1000, 4000.5, 4000.5, 8000.5, null, null, null, null, null, null, null,
    ]);
  });

  it("subtracts spend from the annual allocation", () => {
    expect(report.allocation).toBe(100_000);
    expect(report.spent).toBe(8000.5);
    expect(report.remaining).toBe(91_999.5);
    expect(report.percentSpent).toBe(8);
    expect(report.months[4].remaining).toBe(91_999.5);
    expect(report.months[5].remaining).toBeNull();
  });

  it("counts trained people as of each month end", () => {
    expect(report.months.slice(0, 5).map((m) => m.trained)).toEqual([1, 1, 2, 2, 3]);
    expect(report.trained).toBe(3);
    expect(report.costPerTrained).toBeCloseTo(2666.83, 2);
  });

  it("ignores orphan, duplicate and out-of-year rows", () => {
    const noisy = [
      ...attendance,
      att("A", "2026-01-20", { cost: 1000 }), // exact duplicate
      att("ZZZ", "2026-02-02", { cost: 7777 }), // not on the roster
      att("A", "2025-12-30", { cost: 5555 }), // last year
    ];
    expect(budgetSeries(roster, noisy, cfg).spent).toBe(8000.5);
  });

  it("counts every attendance cost whatever the hours", () => {
    const short = [att("A", "2026-02-01", { hours: 0.25, cost: 300 })];
    expect(budgetSeries(roster, short, cfg).spent).toBe(300);
  });

  it("has no cost per trained person before anyone is trained", () => {
    const none = budgetSeries(roster, [], cfg);
    expect(none.costPerTrained).toBeNull();
    expect(none.spent).toBe(0);
  });

  it("projects planned spend after the as-of month on top of actual spend", () => {
    const planned = Array<number>(12).fill(0);
    planned[5] = 3000; // June
    planned[10] = 2000; // November
    const withPlan = budgetSeries(roster, attendance, cfg, undefined, planned);
    expect(withPlan.months[5].planned).toBe(11_000.5);
    expect(withPlan.months[9].planned).toBe(11_000.5);
    expect(withPlan.months[10].planned).toBe(13_000.5);
    expect(withPlan.months[4].planned).toBeNull(); // actual month
  });

  it("handles a leap-year February month end", () => {
    const leap = config({ year: 2028, asOfDate: "2028-03-15", lateHireCutoff: "2028-10-01" });
    const rows = [att("A", "2028-02-29", { cost: 10 })];
    expect(budgetSeries(roster, rows, leap).months[1].trained).toBe(1);
  });
});

describe("sample budget preset", () => {
  it("applies to the sample data only", () => {
    const people = [emp("A", { hire_date: "2026-02-01" })];
    expect(initialConfigFor("sample", people, "2026-11-08").budgetPhp).toBe(SAMPLE_BUDGET_PHP);
    expect(initialConfigFor("upload", people, "2026-11-08").budgetPhp).toBe(0);
  });
});

describe("formatPesoCompact", () => {
  it("shortens money for chart axes", () => {
    expect(formatPesoCompact(100_000_000)).toBe("₱100M");
    expect(formatPesoCompact(1_250_000)).toBe("₱1.3M");
    expect(formatPesoCompact(350_000)).toBe("₱350K");
    expect(formatPesoCompact(800)).toBe("₱800");
    expect(formatPesoCompact(-2_000_000)).toBe("-₱2M");
  });
});
