import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCalendarEdits,
  buildCalendarCsv,
  buildCalendarView,
  calendarFileName,
  runAnalysis,
  type Analysis,
  type CalendarEdit,
} from "@/lib/analysis";
import { validateCsv, type CalendarRow, type CatalogRow } from "@/lib/schemas";
import { att, config, course, emp } from "./helpers/fixtures";

const linkedin = (fee?: number): CatalogRow => ({ ...course("LL", "linkedin_learning", 90, 0), unlicensed_fee: fee });

const run = (id: string, date: string, over: Partial<CalendarRow> = {}): CalendarRow => ({
  run_id: id,
  course_id: "IH-1",
  date,
  delivery: "in_house",
  cost_per_run: 3000,
  cost_per_head: 0,
  min_pax: 4,
  max_pax: 6,
  ...over,
});

// 4 licensed + 10 unlicensed at risk, plus 6 already trained (as in the plan tests).
const roster = [
  ...Array.from({ length: 4 }, (_, i) => emp(`L${i}`, { licensed: "yes" })),
  ...Array.from({ length: 10 }, (_, i) => emp(`U${i}`, { licensed: "no" })),
  ...Array.from({ length: 6 }, (_, i) => emp(`T${i}`)),
];
const attendance = roster.filter((r) => r.employee_id.startsWith("T")).map((r) => att(r.employee_id, "2026-03-01"));
const rules = config({ budgetPhp: 1_000_000 });

const analyze = (calendar: CalendarRow[]): Analysis =>
  runAnalysis({ roster, attendance, catalog: [linkedin(800)], calendar, config: rules });

const calendar: CalendarRow[] = [
  run("PAST", "2026-08-01"),
  run("R1", "2026-10-15"),
  run("R2", "2026-11-12"),
  run("STAND", "2026-11-20", { min_pax: 12, max_pax: 20 }),
  run("LATE", "2026-12-16"),
  run("OUT", "2025-05-01"),
];

describe("buildCalendarView: run states", () => {
  const analysis = analyze(calendar);
  const view = buildCalendarView(calendar, analysis, rules);
  const byId = Object.fromEntries(view.runs.map((r) => [r.runId, r]));

  it("lists the runs of the year by date and leaves out other years", () => {
    expect(view.runs.map((r) => r.runId)).toEqual(["PAST", "R1", "R2", "STAND", "LATE"]);
  });

  it("marks runs completed, planned, standby or blocked", () => {
    expect(byId.PAST.state).toBe("completed");
    expect(byId.R1.state).toBe("planned");
    expect(byId.R2.state).toBe("planned");
    expect(byId.STAND.state).toBe("standby");
    expect(byId.STAND.reason).toContain("fewer than 12");
    expect(byId.LATE.state).toBe("blocked");
    expect(byId.LATE.reason).toContain("Dec 14");
  });

  it("counts states and the people the plan places", () => {
    expect(view.summary).toMatchObject({ total: 5, completed: 1, planned: 2, standby: 1, blocked: 1, placed: 10, unplaced: 0 });
    expect([byId.R1.planPeople, byId.R2.planPeople]).toEqual([6, 4]);
  });

  it("costs a run at expected enrolment from the company's costing rules", () => {
    expect(byId.R1.plannedCost).toBe(3000);
    expect(byId.R1.fullPerHead).toBe(500);
    const ih = run("IH", "2026-10-01", { cost_per_run: undefined, cost_per_head: undefined, hours: 8, speakers: 2, min_pax: 10, max_pax: 40, expected_pax: 30 });
    const v = buildCalendarView([ih], analyze([ih]), rules);
    expect(v.runs[0].plannedCost).toBe(8500); // 2 x 500 x 4 + 30 x 150
  });

  it("budgets the same upcoming calendar cost as the commitments", () => {
    expect(view.summary.toBudget).toBe(analysis.outlook.commitments.calendar);
  });

  it("sums monthly cost by delivery and leaves blocked runs out of the cost", () => {
    expect(view.months[9]).toMatchObject({ label: "Oct", runs: 1, inHouseCost: 3000, externalCost: 0 });
    expect(view.months[11]).toMatchObject({ runs: 1, inHouseCost: 0 }); // LATE counted, not costed
    expect(view.summary.totalCost).toBe(3000 * 3 + 3000 + 0); // PAST, R1, R2, STAND (cost 3000 each)
  });

  it("marks the milestone, as-of, cutoff and deadline dates", () => {
    expect(view.markers.map((m) => [m.kind, m.date])).toEqual([
      ["milestone", "2026-03-31"],
      ["milestone", "2026-06-30"],
      ["milestone", "2026-09-30"],
      ["milestone", "2026-11-30"],
      ["as-of", "2026-09-30"],
      ["cutoff", "2026-12-14"],
      ["deadline", "2026-12-31"],
    ]);
  });

  it("alerts on blocked, standby and out-of-year runs without blocking", () => {
    const text = view.alerts.map((a) => a.text).join(" | ");
    expect(text).toContain("after Dec 14");
    expect(text).toContain("not needed to close the gap");
    expect(text).toContain("outside 2026");
  });
});

describe("buildCalendarView: mix of runs", () => {
  const mix = (inHouse: number, external: number): CalendarRow[] => [
    ...Array.from({ length: inHouse }, (_, i) => run(`I${i}`, `2026-10-${String(1 + i).padStart(2, "0")}`)),
    ...Array.from({ length: external }, (_, i) =>
      run(`E${i}`, `2026-11-${String(1 + i).padStart(2, "0")}`, { delivery: "external", cost_per_run: undefined, cost_per_head: 6500, min_pax: 1 }),
    ),
  ];
  const view = (rows: CalendarRow[]) => buildCalendarView(rows, analyze(rows), rules);

  it("shows 3.0 : 1 for 36 external and 12 in-house runs, with no mix alert", () => {
    const v = view([...mix(12, 0), ...Array.from({ length: 36 }, (_, i) => run(`E${i}`, `2026-11-${String((i % 28) + 1).padStart(2, "0")}`, { delivery: "external", cost_per_run: undefined, cost_per_head: 6500, min_pax: 1 }))]);
    expect(v.summary).toMatchObject({ inHouse: 12, external: 36, ratioText: "3.0 : 1" });
    expect(v.alerts.some((a) => a.text.includes("face-to-face mix"))).toBe(false);
  });

  it("shows 1.0 : 1 for equal mixes and raises a mix alert", () => {
    const v = view(mix(10, 10));
    expect(v.summary.ratioText).toBe("1.0 : 1");
    expect(v.alerts.some((a) => a.text.includes("face-to-face mix is 1.0 : 1"))).toBe(true);
  });

  it("handles a calendar with no in-house runs", () => {
    const v = view(mix(0, 3));
    expect(v.summary.ratio).toBeNull();
    expect(v.summary.ratioText).toBe("no in-house runs");
  });
});

describe("buildCalendarView: sample calendar", () => {
  const parsed = validateCsv("calendar", readFileSync("public/sample/calendar.csv", "utf8"));

  it("has 48 runs, 36 external to 12 in-house, with no mix alert", () => {
    if (!parsed.ok) throw new Error("sample calendar invalid");
    const rows = parsed.rows as CalendarRow[];
    const v = buildCalendarView(rows, analyze(rows), rules);
    expect(v.summary).toMatchObject({ total: 48, inHouse: 12, external: 36, ratioText: "3.0 : 1" });
    expect(v.alerts.some((a) => a.text.includes("face-to-face mix"))).toBe(false);
  });
});

describe("applyCalendarEdits", () => {
  const base = [run("A", "2026-10-01"), run("B", "2026-10-02")];

  it("returns the uploaded calendar for an empty edit list", () => {
    expect(applyCalendarEdits(base)).toEqual(base);
    expect(applyCalendarEdits(base, [])).toEqual(base);
  });

  it("removes a run and replaces or adds one by run_id", () => {
    const edits: CalendarEdit[] = [
      { type: "remove", runId: "A" },
      { type: "upsert", row: run("B", "2026-10-09") },
      { type: "upsert", row: run("C", "2026-10-03") },
    ];
    expect(applyCalendarEdits(base, edits).map((r) => [r.run_id, r.date])).toEqual([
      ["B", "2026-10-09"],
      ["C", "2026-10-03"],
    ]);
    expect(base).toHaveLength(2); // the uploaded rows are never mutated
  });

  it("feeds the view, so an edit changes what the tab shows", () => {
    const rows = [run("A", "2026-10-01"), run("B", "2026-10-02")];
    const v = buildCalendarView(rows, analyze(rows), rules, [{ type: "remove", runId: "A" }]);
    expect(v.runs.map((r) => r.runId)).toEqual(["B"]);
  });
});

describe("buildCalendarCsv", () => {
  it("exports the runs with cost, state and reason, guarding formulas", () => {
    const rows = [run("R1", "2026-10-15", { run_title: "=SUM(A1)" }), run("LATE", "2026-12-16")];
    const csv = buildCalendarCsv(buildCalendarView(rows, analyze(rows), rules));
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "run_id,course_id,run_title,date,delivery,hours,speakers,cost_per_run,cost_per_head,min_pax,max_pax,expected_pax,planned_cost,state,plan_people,reason",
    );
    expect(lines[1]).toContain("'=SUM(A1)");
    expect(lines[1]).toContain(",planned,6,");
    expect(lines[2]).toContain(",blocked,0,after the Dec 14 in-person cutoff");
    expect(calendarFileName(2026)).toBe("training-calendar-2026.csv");
  });
});
