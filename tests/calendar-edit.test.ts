import { describe, expect, it } from "vitest";
import {
  applyCalendarEdits,
  blankDraft,
  buildCalendarView,
  changedRunCount,
  describeEdits,
  draftFromRow,
  duplicateDraft,
  editedRunIds,
  newRunId,
  removedRuns,
  restoreRun,
  runAnalysis,
  undoEdit,
  validateDraft,
  type CalendarEdit,
  type DraftContext,
  type RunDraft,
} from "@/lib/analysis";
import type { CalendarRow, CatalogRow } from "@/lib/schemas";
import { att, config, course, emp } from "./helpers/fixtures";

const linkedin: CatalogRow = { ...course("LL", "linkedin_learning", 90, 0), unlicensed_fee: 800 };
const row = (id: string, date: string, over: Partial<CalendarRow> = {}): CalendarRow => ({
  run_id: id,
  course_id: "IH-1",
  run_title: `Run ${id}`,
  date,
  delivery: "in_house",
  cost_per_run: 3000,
  cost_per_head: 0,
  min_pax: 4,
  max_pax: 6,
  ...over,
});
const base = [row("A", "2026-10-15"), row("B", "2026-11-12")];
const ctx: DraftContext = { year: 2026, asOfDate: "2026-09-30", takenIds: new Set(["A", "B"]) };

const valid = (over: Partial<RunDraft> = {}): RunDraft => ({
  run_id: "NEW-1",
  course_id: "IH-9",
  run_title: "New course",
  date: "2026-10-20",
  delivery: "in_house",
  hours: "4",
  speakers: "1",
  cost_per_run: "",
  cost_per_head: "",
  min_pax: "10",
  max_pax: "30",
  expected_pax: "20",
  ...over,
});

describe("validateDraft", () => {
  it("accepts a complete in-house run with blank cost cells", () => {
    const r = validateDraft(valid(), ctx);
    expect(r.errors).toEqual({});
    expect(r.warnings).toEqual([]);
    expect(r.row).toMatchObject({ run_id: "NEW-1", delivery: "in_house", hours: 4, min_pax: 10, max_pax: 30, expected_pax: 20 });
    expect(r.row?.cost_per_run).toBeUndefined();
  });

  it("refuses seat limits that do not fit together", () => {
    expect(validateDraft(valid({ min_pax: "10", max_pax: "5", expected_pax: "" }), ctx).errors.max_pax).toContain("at least min_pax");
    expect(validateDraft(valid({ expected_pax: "40" }), ctx).errors.expected_pax).toContain("between");
    expect(validateDraft(valid({ max_pax: "abc" }), ctx).errors.max_pax).toBeDefined();
  });

  it("requires a fee per person for an external run", () => {
    const external = valid({ delivery: "external", hours: "", speakers: "", min_pax: "1" });
    expect(validateDraft(external, ctx).errors.cost_per_head).toContain("required");
    const r = validateDraft({ ...external, cost_per_head: "18000" }, ctx);
    expect(r.errors).toEqual({});
    expect(r.row?.cost_per_head).toBe(18000);
  });

  it("refuses a malformed date, a date outside the year and a repeated run id", () => {
    expect(validateDraft(valid({ date: "20-10-2026" }), ctx).errors.date).toBeDefined();
    expect(validateDraft(valid({ date: "2027-02-01" }), ctx).errors.date).toBe("must be in 2026");
    expect(validateDraft(valid({ run_id: "A" }), ctx).errors.run_id).toContain("already used");
    expect(validateDraft(valid({ run_id: "" }), ctx).errors.run_id).toBeDefined();
    expect(validateDraft(valid({ date: "2027-02-01" }), ctx).row).toBeNull();
  });

  it("warns, without blocking, about dates after Dec 14 or on or before the as-of date", () => {
    const late = validateDraft(valid({ date: "2026-12-16" }), ctx);
    expect(late.row).not.toBeNull();
    expect(late.warnings[0]).toContain("after Dec 14");
    const past = validateDraft(valid({ date: "2026-09-30" }), ctx);
    expect(past.row).not.toBeNull();
    expect(past.warnings[0]).toContain("already held");
  });

  it("limits hours to a day and speakers to 20", () => {
    expect(validateDraft(valid({ hours: "30" }), ctx).errors.hours).toBeDefined();
    expect(validateDraft(valid({ speakers: "25" }), ctx).errors.speakers).toBeDefined();
  });
});

describe("drafts", () => {
  it("round-trips a run through the form", () => {
    const r = row("A", "2026-10-15");
    const result = validateDraft(draftFromRow(r), { ...ctx, takenIds: new Set(["B"]) });
    expect(result.row).toEqual(r);
  });

  it("numbers new runs and duplicates under an unused id", () => {
    expect(newRunId(["A", "NEW-1", "NEW-3"])).toBe("NEW-2");
    expect(blankDraft(["NEW-1"], "external")).toMatchObject({ run_id: "NEW-2", delivery: "external", course_id: "EXTERNAL", min_pax: "1" });
    expect(duplicateDraft(base[0], ["A", "B"])).toMatchObject({ run_id: "NEW-1", run_title: "Run A", date: "2026-10-15" });
  });
});

describe("change history", () => {
  const changed: CalendarEdit[] = [
    { type: "upsert", row: row("A", "2026-10-22") }, // move A
    { type: "upsert", row: row("A", "2026-10-29") }, // move A again
    { type: "remove", runId: "B" },
    { type: "upsert", row: row("NEW-1", "2026-11-03") },
  ];

  it("applies changes in order, the last change to a run winning", () => {
    expect(applyCalendarEdits(base, changed).map((r) => [r.run_id, r.date])).toEqual([
      ["A", "2026-10-29"],
      ["NEW-1", "2026-11-03"],
    ]);
  });

  it("undoes only the last change", () => {
    expect(undoEdit(changed)).toHaveLength(3);
    expect(applyCalendarEdits(base, undoEdit(changed)).map((r) => r.run_id)).toEqual(["A"]);
    expect(applyCalendarEdits(base, undoEdit(changed.slice(0, 2))).find((r) => r.run_id === "A")?.date).toBe("2026-10-22");
    expect(undoEdit([])).toEqual([]);
  });

  it("restores a removed run by dropping every change to it", () => {
    const restored = restoreRun(changed, "B");
    expect(removedRuns(base, changed).map((r) => r.run_id)).toEqual(["B"]);
    expect(removedRuns(base, restored)).toEqual([]);
    expect(applyCalendarEdits(base, restoreRun(changed, "A")).find((r) => r.run_id === "A")?.date).toBe("2026-10-15");
  });

  it("counts the runs touched and tags the added or changed ones that remain", () => {
    expect(changedRunCount(changed)).toBe(3);
    expect([...editedRunIds(base, changed)].sort()).toEqual(["A", "NEW-1"]);
  });

  it("describes the changes newest first", () => {
    expect(describeEdits(base, changed)).toEqual([
      "Added Run NEW-1 (2026-11-03)",
      "Removed Run B (2026-11-12)",
      "Changed Run A (2026-10-29)",
      "Changed Run A (2026-10-22)",
    ]);
  });
});

describe("what-if effect on the analysis", () => {
  const roster = [
    ...Array.from({ length: 10 }, (_, i) => emp(`U${i}`, { licensed: "no" })),
    ...Array.from({ length: 6 }, (_, i) => emp(`T${i}`)),
  ];
  const attendance = roster.filter((r) => r.employee_id.startsWith("T")).map((r) => att(r.employee_id, "2026-03-01"));
  const rules = config({ budgetPhp: 1_000_000 });
  const run = (calendar: CalendarRow[]) => {
    const analysis = runAnalysis({ roster, attendance, catalog: [linkedin], calendar, config: rules });
    return { analysis, view: buildCalendarView(calendar, analysis, rules) };
  };

  it("recomputes the plan, commitments and view with an added run, and resets exactly", () => {
    const before = run(base);
    const edits: CalendarEdit[] = [{ type: "upsert", row: row("NEW-1", "2026-10-20", { cost_per_run: 1000, max_pax: 10, expected_pax: 8 }) }];
    const after = run(applyCalendarEdits(base, edits));
    expect(after.view.runs.map((r) => r.runId)).toContain("NEW-1");
    expect(after.analysis.outlook.commitments.calendar).toBeGreaterThan(before.analysis.outlook.commitments.calendar);
    expect(after.analysis.outlook.projectedBalance).toBeLessThan(before.analysis.outlook.projectedBalance);

    const reset = run(applyCalendarEdits(base, []));
    expect(reset.analysis.outlook.commitments.calendar).toBe(before.analysis.outlook.commitments.calendar);
    expect(reset.analysis.cost?.costToClose).toBe(before.analysis.cost?.costToClose);
  });

  it("removing a run lowers what is still to budget", () => {
    const before = run(base);
    const after = run(applyCalendarEdits(base, [{ type: "remove", runId: "B" }]));
    expect(after.view.summary.toBudget).toBeLessThan(before.view.summary.toBudget);
    expect(after.view.runs.map((r) => r.runId)).toEqual(["A"]);
  });
});
