import { describe, expect, it } from "vitest";
import {
  buildCalendarView,
  cellState,
  courseTimeline,
  defaultQuarter,
  isAvailable,
  quarterCounts,
  quarterMonths,
  quarterOfMonth,
  quarterSummary,
  runAnalysis,
  runsInMonth,
  seatsOpen,
  windowsInQuarter,
  type CalendarRun,
} from "@/lib/analysis";
import type { CalendarRow, CatalogRow } from "@/lib/schemas";
import { att, config, course, emp } from "./helpers/fixtures";

const linkedin: CatalogRow = { ...course("LL", "linkedin_learning", 90, 0), unlicensed_fee: 800 };

const run = (id: string, date: string, over: Partial<CalendarRow> = {}): CalendarRow => ({
  run_id: id,
  course_id: "IH-1",
  date,
  delivery: "in_house",
  cost_per_run: 3000,
  cost_per_head: 0,
  min_pax: 4,
  max_pax: 10,
  expected_pax: 4,
  ...over,
});
const ext = (id: string, date: string, title: string, over: Partial<CalendarRow> = {}): CalendarRow =>
  run(id, date, { delivery: "external", run_title: title, cost_per_run: undefined, cost_per_head: 6500, min_pax: 1, max_pax: 20, expected_pax: 12, ...over });

// 4 licensed + 10 unlicensed at risk, plus 6 trained.
const roster = [
  ...Array.from({ length: 4 }, (_, i) => emp(`L${i}`, { licensed: "yes" })),
  ...Array.from({ length: 10 }, (_, i) => emp(`U${i}`, { licensed: "no" })),
  ...Array.from({ length: 6 }, (_, i) => emp(`T${i}`)),
];
const attendance = roster.filter((r) => r.employee_id.startsWith("T")).map((r) => att(r.employee_id, "2026-03-01"));

const runsOf = (rows: CalendarRow[], asOfDate = "2026-09-30"): CalendarRun[] => {
  const rules = config({ asOfDate, budgetPhp: 1_000_000 });
  const analysis = runAnalysis({ roster, attendance, catalog: [linkedin], calendar: rows, config: rules });
  return buildCalendarView(rows, analysis, rules).runs;
};

describe("courseTimeline", () => {
  const rows = [
    run("I1", "2026-02-10", { run_title: "Records Management" }),
    ext("E2", "2026-07-14", "Zeta Course"),
    ext("E1", "2026-01-20", "Zeta Course"),
    ext("E3", "2026-03-10", "Alpha Course"),
  ];
  const timeline = courseTimeline(runsOf(rows));

  it("gives one row per course, external first then in-house, alphabetical", () => {
    expect(timeline.map((r) => [r.delivery, r.title])).toEqual([
      ["external", "Alpha Course"],
      ["external", "Zeta Course"],
      ["in_house", "Records Management"],
    ]);
  });

  it("keeps each course's runs in date order and finds the months that have a run", () => {
    const zeta = timeline[1];
    expect(zeta.runs.map((r) => r.runId)).toEqual(["E1", "E2"]);
    expect([0, 1, 2, 3, 4, 5, 6].map((m) => runsInMonth(zeta, m).length)).toEqual([1, 0, 0, 0, 0, 0, 1]);
  });

  it("shows the most actionable state when a month holds several runs", () => {
    const mixed = runsOf([run("A", "2026-10-05", { run_title: "Mix" }), run("B", "2026-10-15", { run_title: "Mix" })], "2026-10-10");
    expect(mixed.map((r) => r.state)).toEqual(["completed", "planned"]);
    expect(cellState(mixed)).toBe("planned");
    const blockedAndHeld = runsOf([run("A", "2026-08-05"), run("B", "2026-12-16")]);
    expect(cellState(blockedAndHeld.filter((r) => r.state === "blocked"))).toBe("blocked");
    expect(cellState(blockedAndHeld)).toBe("completed");
  });
});

describe("available runs and seats open", () => {
  const runs = runsOf([
    run("PAST", "2026-09-22"),
    run("OPEN", "2026-10-14"),
    run("STAND", "2026-11-20", { min_pax: 12, max_pax: 20, expected_pax: 12 }),
    run("LATE", "2026-12-16"),
  ]);
  const by = Object.fromEntries(runs.map((r) => [r.runId, r]));

  it("treats only runs after the as-of date and on or before Dec 14 as available", () => {
    expect(runs.map((r) => [r.runId, isAvailable(r)])).toEqual([
      ["PAST", false],
      ["OPEN", true],
      ["STAND", true],
      ["LATE", false],
    ]);
  });

  it("estimates seats open as maximum minus expected, for available runs only", () => {
    expect(by.OPEN.state).toBe("planned");
    expect(by.STAND.state).toBe("standby");
    expect(seatsOpen(by.OPEN)).toBe(6);
    expect(seatsOpen(by.STAND)).toBe(8);
    expect(seatsOpen(by.PAST)).toBe(0);
    expect(seatsOpen(by.LATE)).toBe(0);
  });
});

describe("quarters", () => {
  it("maps months to quarters", () => {
    expect([0, 2, 3, 5, 6, 8, 9, 11].map(quarterOfMonth)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(quarterMonths(4)).toEqual([9, 10, 11]);
  });

  const runs = runsOf([
    run("Q1", "2026-02-10"),
    run("Q3", "2026-09-22"),
    run("Q4A", "2026-10-14"),
    ext("Q4B", "2026-11-03", "PMP Prep"),
    run("Q4C", "2026-12-16"),
  ]);

  it("summarizes a quarter: runs by delivery, seats open, cost without blocked runs", () => {
    const s = quarterSummary(runs, 4);
    expect(s).toMatchObject({ quarter: 4, runs: 3, external: 1, inHouse: 2 });
    expect(s.seatsOpen).toBe(6 + 8); // Q4A (10-4) + Q4B (20-12); the Dec 16 run is blocked
    expect(s.cost).toBe(3000 + 12 * 6500); // Q4A 3,000 + Q4B 78,000; Q4C not counted
  });

  it("counts every quarter for the buttons", () => {
    expect(quarterCounts(runs).map((c) => [c.quarter, c.total, c.available])).toEqual([
      [1, 1, 0],
      [2, 0, 0],
      [3, 1, 0],
      [4, 3, 2],
    ]);
  });

  it("defaults to the first quarter from the as-of quarter with an available run", () => {
    expect(defaultQuarter(runs, "2026-09-30")).toBe(4);
    const onlyPast = runsOf([run("P", "2026-02-10")]);
    expect(defaultQuarter(onlyPast, "2026-09-30")).toBe(3); // nothing available: the as-of quarter
  });

  it("lists the recommended-course windows that fall in a quarter", () => {
    const windows = [
      { unit: "BBS", month: 2, state: "closed", size: 10 },
      { unit: "TIBS", month: 10, state: "upcoming", size: 8 },
    ] as const;
    expect(windowsInQuarter(windows, 1).map((w) => w.unit)).toEqual(["BBS"]);
    expect(windowsInQuarter(windows, 4).map((w) => w.unit)).toEqual(["TIBS"]);
    expect(windowsInQuarter(windows, 2)).toEqual([]);
  });
});
