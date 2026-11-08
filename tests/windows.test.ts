import { describe, expect, it } from "vitest";
import { evaluateRoster } from "@/lib/engine";
import {
  planSectorWindows,
  recommendedCourse,
  scheduleUnits,
  windowStatus,
} from "@/lib/analysis";
import { att, config, course, emp } from "./helpers/fixtures";
import type { RosterRow } from "@/lib/schemas";

function people(sector: string, group: string, n: number, start = 0): RosterRow[] {
  return Array.from({ length: n }, (_, i) => emp(`${group}-${start + i}`, { sector, group }));
}

// 100 staff: sector A holds 40% (two groups of 20); B..G hold 15, 12, 10, 8, 8, 7.
const roster = [
  ...people("A", "A1", 20),
  ...people("A", "A2", 20),
  ...people("B", "B1", 15),
  ...people("C", "C1", 12),
  ...people("D", "D1", 10),
  ...people("E", "E1", 8),
  ...people("F", "F1", 8),
  ...people("G", "G1", 7),
];
const { results } = evaluateRoster(roster, [], config());

describe("scheduleUnits", () => {
  it("splits a sector above 30% of staff into its groups", () => {
    const { units } = scheduleUnits(results, roster);
    expect(units.map((u) => u.unit).sort()).toEqual(
      ["A · A1", "A · A2", "B", "C", "D", "E", "F", "G"].sort(),
    );
    expect(units.find((u) => u.unit === "A · A1")?.size).toBe(20);
  });

  it("has no units when the roster has no sector column", () => {
    const bare = [emp("1"), emp("2")];
    expect(scheduleUnits(evaluateRoster(bare, [], config()).results, bare).units).toEqual([]);
  });
});

describe("planSectorWindows", () => {
  const { units } = scheduleUnits(results, roster);

  it("gives every unit a whole month inside Feb-Oct, largest first, one per month", () => {
    const plan = planSectorWindows(units, config());
    // 8 units over 9 months: month = 2 + floor(i * 9 / 8).
    expect(plan.windows.map((w) => w.month)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.windows[0]).toMatchObject({ start: "2026-02-01", end: "2026-02-28", size: 20 });
    expect(plan.windows[7].end).toBe("2026-09-30");
    expect(plan.reachable).toBe(true);
    expect(plan.peakShare).toBe(0.2);
  });

  it("reaches each milestone target with the windows that end before it", () => {
    const { windows } = planSectorWindows(units, config());
    const done = (date: string) => windows.filter((w) => w.end <= date).reduce((s, w) => s + w.size, 0);
    expect(done("2026-03-31")).toBeGreaterThanOrEqual(25);
    expect(done("2026-06-30")).toBeGreaterThanOrEqual(50);
    expect(done("2026-09-30")).toBeGreaterThanOrEqual(85);
    expect(done("2026-11-30")).toBe(100);
  });

  it("packs from January when the spread would miss the targets", () => {
    const two = [{ unit: "X", size: 50 }, { unit: "Y", size: 50 }];
    const plan = planSectorWindows(two, config({ milestoneTargets: [90, 95, 99, 100] }));
    expect(plan.windows.map((w) => w.month)).toEqual([1, 2]);
    expect(plan.reachable).toBe(true);
  });

  it("reports unreachable targets instead of hiding them", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ unit: `U${i}`, size: 10 }));
    const plan = planSectorWindows(many, config({ milestoneTargets: [100, 100, 100, 100] }));
    expect(plan.reachable).toBe(false);
    expect(plan.windows).toHaveLength(11);
  });
});

describe("windowStatus", () => {
  const scheme = scheduleUnits(results, roster);
  const { windows } = planSectorWindows(scheme.units, config());
  const aml = { ...course("LL-AML", "linkedin_learning", 90, 0), title: "AML Foundations", recommended: "yes" as const };
  const feb = windows[0]; // "A · A1", Feb 2026
  const febPeople = roster.filter((r) => scheme.label(r) === feb.unit);

  it("counts completions inside the window and missed people after it closes", () => {
    const attendance = [
      att(febPeople[0].employee_id, "2026-02-10", { training_title: " aml foundations " }),
      att(febPeople[1].employee_id, "2026-02-20", { training_title: "AML Foundations" }),
      att(febPeople[2].employee_id, "2026-05-02", { training_title: "AML Foundations" }), // outside the window
    ];
    const asOf = "2026-06-30";
    const res = evaluateRoster(roster, attendance, config({ asOfDate: asOf })).results;
    const row = windowStatus(windows, scheme, aml, res, roster, attendance, asOf)[0];
    expect(row).toMatchObject({ state: "closed", completed: 2, pending: 0, missed: 18 });
  });

  it("shows open and upcoming windows with pending people", () => {
    const asOf = "2026-02-15";
    const res = evaluateRoster(roster, [], config({ asOfDate: asOf })).results;
    const rows = windowStatus(windows, scheme, aml, res, roster, [], asOf);
    expect(rows[0]).toMatchObject({ state: "open", completed: 0, pending: 20, missed: 0 });
    expect(rows[1]).toMatchObject({ state: "upcoming", pending: 20, missed: 0 });
  });
});

describe("recommendedCourse", () => {
  it("picks the first recommended LinkedIn course by id", () => {
    const rec = (id: string) => ({ ...course(id, "linkedin_learning", 90, 0), recommended: "yes" as const });
    expect(recommendedCourse([course("LL-1", "linkedin_learning", 60, 0), rec("LL-9"), rec("LL-3")])?.course_id).toBe("LL-3");
    expect(recommendedCourse([course("LL-1", "linkedin_learning", 60, 0)])).toBeNull();
    expect(recommendedCourse(null)).toBeNull();
  });
});
