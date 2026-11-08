import { describe, expect, it } from "vitest";
import { evaluateRoster } from "@/lib/engine";
import { buildPlan } from "@/lib/analysis";
import { validateCsv } from "@/lib/schemas";
import type { CalendarRow, CatalogRow } from "@/lib/schemas";
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

// 4 licensed + 10 unlicensed at risk, plus 6 already trained.
const roster = [
  ...Array.from({ length: 4 }, (_, i) => emp(`L${i}`, { licensed: "yes" })),
  ...Array.from({ length: 10 }, (_, i) => emp(`U${i}`, { licensed: "no" })),
  ...Array.from({ length: 6 }, (_, i) => emp(`T${i}`)),
];
const attendance = roster.filter((r) => r.employee_id.startsWith("T")).map((r) => att(r.employee_id, "2026-03-01"));
const { results } = evaluateRoster(roster, attendance, config());

describe("buildPlan", () => {
  it("closes licensed staff through LinkedIn at 0 and fills runs in date order", () => {
    const plan = buildPlan(results, roster, [linkedin(800)], [run("R2", "2026-11-12"), run("R1", "2026-10-15")], config());
    expect(plan.licensedLinkedIn).toBe(4);
    expect(plan.runs.map((r) => [r.runId, r.participants, r.state])).toEqual([
      ["R1", 6, "held"],
      ["R2", 4, "held"],
    ]);
    expect(plan.runsCost).toBe(6000);
    expect(plan.paidLinkedIn).toBe(0);
    expect(plan.unplaced).toBe(0);
  });

  it("cancels a run below its minimum and leaves its people for the next option", () => {
    const plan = buildPlan(results, roster, [linkedin(800)], [run("R1", "2026-10-15", { min_pax: 12 })], config());
    expect(plan.runs[0]).toMatchObject({ state: "cancelled", cost: 0, participants: 0 });
    expect(plan.runs[0].reason).toContain("fewer than 12");
    expect(plan.paidLinkedIn).toBe(10); // all unlicensed fall back to the paid LinkedIn fee
    expect(plan.linkedInCost).toBe(8000);
  });

  it("never uses an in-person run after Dec 14 or before the as-of date", () => {
    const plan = buildPlan(
      results,
      roster,
      [linkedin(800)],
      [run("LATE", "2026-12-16"), run("PAST", "2026-08-01"), run("OK", "2026-12-14")],
      config(),
    );
    expect(plan.runs.map((r) => [r.runId, r.state])).toEqual([
      ["OK", "held"],
      ["LATE", "cancelled"],
    ]);
    expect(plan.runs.find((r) => r.runId === "LATE")?.reason).toContain("Dec 14");
  });

  it("charges external courses per head and in-house runs per run", () => {
    const external = run("EX", "2026-10-20", { delivery: "external", cost_per_run: undefined, cost_per_head: 6500, min_pax: 1, max_pax: 3 });
    const plan = buildPlan(results, roster, [linkedin()], [external], config());
    expect(plan.runs[0]).toMatchObject({ participants: 3, cost: 19_500 });
  });

  it("skips a run that is costlier per head than the paid LinkedIn fee", () => {
    const external = run("EX", "2026-10-20", { delivery: "external", cost_per_run: undefined, cost_per_head: 6500, min_pax: 1, max_pax: 3 });
    const plan = buildPlan(results, roster, [linkedin(800)], [external, run("IH", "2026-10-25")], config());
    expect(plan.runs.find((r) => r.runId === "EX")).toMatchObject({ state: "cancelled", cost: 0 });
    expect(plan.runs.find((r) => r.runId === "EX")?.reason).toContain("costlier than paid LinkedIn");
    expect(plan.runs.find((r) => r.runId === "IH")?.state).toBe("held"); // ₱3000 / 6 = ₱500 per head
  });

  it("marks people unplaced when there is no run and no paid LinkedIn fee", () => {
    const plan = buildPlan(results, roster, [linkedin()], [], config());
    expect(plan.unplaced).toBe(10);
    expect(plan.paidLinkedIn).toBe(0);
  });

  it("treats licensed staff like everyone else when e-learning does not count", () => {
    const plan = buildPlan(results, roster, [linkedin(800)], [run("R1", "2026-10-15", { max_pax: 14, min_pax: 1 })], config({ elearningCounts: false }));
    expect(plan.licensedLinkedIn).toBe(0);
    expect(plan.runs[0].participants).toBe(14);
  });

  it("spreads planned spend by month, putting LinkedIn on November 30", () => {
    const plan = buildPlan(results, roster, [linkedin(800)], [run("R1", "2026-10-15", { max_pax: 6 }), run("R2", "2026-11-12", { cost_per_run: 1000, min_pax: 1, max_pax: 2 })], config());
    expect(plan.plannedByMonth[9]).toBe(3000); // October run
    expect(plan.plannedByMonth[10]).toBe(1000 + 2 * 800); // November run plus 2 paid LinkedIn on Nov 30
    expect(plan.totalPlannedCost).toBe(5600);
  });

  it("projects trained staff at each remaining milestone against its target", () => {
    const plan = buildPlan(results, roster, [linkedin(800)], [run("R1", "2026-10-15", { max_pax: 6 })], config());
    // Sep 30 is the as-of date, so only Nov 30 remains. 6 trained + 6 in the run + 4 licensed + 4 paid = 20.
    expect(plan.milestones).toEqual([
      { label: "Nov 30", date: "2026-11-30", projected: 20, targetTrained: 20, gap: 0 },
    ]);
  });

  it("closes licensed staff at their sector window end when it is still ahead", () => {
    const sectored = roster.map((r) => (r.employee_id.startsWith("L") ? { ...r, sector: "S" } : r));
    const early = config({ asOfDate: "2026-01-31" });
    const trainedEarly = sectored.filter((r) => r.employee_id.startsWith("T")).map((r) => att(r.employee_id, "2026-01-10"));
    const res = evaluateRoster(sectored, trainedEarly, early).results;
    const windows = [{ unit: "S", month: 3, start: "2026-03-01", end: "2026-03-31", size: 4 }];
    const plan = buildPlan(res, sectored, [linkedin(800)], [], early, { windows, label: (e) => e.sector ?? "Unassigned" });
    const mar = plan.milestones.find((m) => m.label === "Mar 31");
    expect(mar?.projected).toBe(6 + 4 + 0); // 6 trained now + 4 licensed closing in March (the 10 unlicensed are not yet placed)
  });
});

describe("calendar.csv", () => {
  const header = "run_id,course_id,date,delivery,cost_per_run,cost_per_head,min_pax,max_pax";

  it("validates runs; in-house costs may be blank but an external fee is required", () => {
    const ok = validateCsv("calendar", `${header}\nR1,IH-1,2026-10-15,in_house,3000,0,5,8\nR2,EXT,2026-11-05,external,,6500,1,4`);
    expect(ok.ok).toBe(true);
    const blankInHouse = validateCsv("calendar", `${header}\nR1,IH-1,2026-10-15,in_house,,,5,8`);
    expect(blankInHouse.ok).toBe(true);
    const noFee = validateCsv("calendar", `${header}\nR2,EXT,2026-11-05,external,,,1,4`);
    expect(noFee.ok).toBe(false);
    if (!noFee.ok) expect(noFee.errors[0]).toMatchObject({ field: "cost_per_head" });
  });

  it("rejects max_pax below min_pax and duplicate run ids", () => {
    expect(validateCsv("calendar", `${header}\nR1,IH,2026-10-15,in_house,100,0,8,5`).ok).toBe(false);
    const dup = validateCsv("calendar", `${header}\nR1,IH,2026-10-15,in_house,100,0,2,5\nR1,IH,2026-10-16,in_house,100,0,2,5`);
    expect(dup.ok).toBe(false);
  });
});
