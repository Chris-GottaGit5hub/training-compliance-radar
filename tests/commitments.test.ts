import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { budgetSeries, buildCommitments, resolveRun, runAnalysis, runCost } from "@/lib/analysis";
import { validateCsv, defaultRulesConfig, type CalendarRow } from "@/lib/schemas";
import { att, config, course, emp } from "./helpers/fixtures";

const run = (id: string, date: string, over: Partial<CalendarRow> = {}): CalendarRow => ({
  run_id: id,
  course_id: "X",
  date,
  delivery: "in_house",
  min_pax: 4,
  max_pax: 40,
  ...over,
});

describe("costing rules", () => {
  it("prices an 8-hour in-house run with 2 speakers and 30 people at ₱8,500", () => {
    const r = resolveRun(run("A", "2026-10-15", { hours: 8, speakers: 2, expected_pax: 30 }));
    expect(r).toMatchObject({ perRun: 4000, perHead: 150, expectedPax: 30 });
    expect(runCost(r, 30)).toBe(8500);
  });

  it("prices a 4-hour run with 1 speaker at ₱1,000 plus ₱75 a head", () => {
    const r = resolveRun(run("B", "2026-10-15", { hours: 4, speakers: 1 }));
    expect(r).toMatchObject({ perRun: 1000, perHead: 75 });
    expect(runCost(r, 20)).toBe(2500);
  });

  it("defaults to one speaker for a full day, capping snacks at two", () => {
    expect(resolveRun(run("C", "2026-10-15"))).toMatchObject({ perRun: 2000, perHead: 150, expectedPax: 40 });
    expect(resolveRun(run("D", "2026-10-15", { hours: 12 })).perHead).toBe(150);
  });

  it("charges an external training its fee per participant and nothing per run", () => {
    const r = resolveRun(run("E", "2026-10-15", { delivery: "external", cost_per_head: 18_000, max_pax: 6 }));
    expect(r).toMatchObject({ perRun: 0, perHead: 18_000 });
    expect(runCost(r, 3)).toBe(54_000);
  });

  it("lets explicit cost cells win over the rules", () => {
    expect(resolveRun(run("F", "2026-10-15", { cost_per_run: 99, cost_per_head: 7 }))).toMatchObject({ perRun: 99, perHead: 7 });
  });
});

describe("commitments and the projected balance", () => {
  const roster = [emp("A"), emp("B")];
  const cfg = config({ budgetPhp: 1_000_000, asOfDate: "2026-09-30" });
  const attendance = [att("A", "2026-03-01", { cost: 400_000, delivery: "external", training_title: "Ext" })];
  const calendar = [
    run("PAST", "2026-05-01", { expected_pax: 10 }), // before the as-of date: already in attendance
    run("IH", "2026-10-15", { hours: 8, speakers: 2, expected_pax: 30 }), // 8,500
    run("EXT", "2026-11-10", { delivery: "external", cost_per_head: 10_000, min_pax: 1, max_pax: 5, expected_pax: 3 }), // 30,000
    run("LATE", "2026-12-16", { expected_pax: 30 }), // after Dec 14: never held
  ];

  it("budgets every future calendar run at its expected enrolment, in or out of the plan", () => {
    const c = buildCommitments(calendar, null, roster, attendance, { ...cfg, nominationReservePhp: 0 });
    expect(c.runs.map((r) => [r.runId, r.people, r.cost])).toEqual([["IH", 30, 8500], ["EXT", 3, 30_000]]);
    expect(c.calendar).toBe(38_500);
    expect(c.byMonth[9]).toBe(8500); // October
    expect(c.byMonth[10]).toBe(30_000); // November
  });

  it("budgets the larger of the expected and the planned people", () => {
    const plan = { runs: [{ runId: "IH", participants: 35 }] } as never;
    const c = buildCommitments(calendar, plan, roster, attendance, { ...cfg, nominationReservePhp: 0 });
    expect(c.runs[0].people).toBe(35);
    expect(c.runs[0].cost).toBe(4000 + 150 * 35);
  });

  it("estimates nominations from the external run-rate, or uses the figure from Rules", () => {
    // ₱400,000 external over 9 months, 3 months left.
    const est = buildCommitments([], null, roster, attendance, cfg);
    expect(est.nominationsEstimated).toBe(true);
    expect(est.nominations).toBeCloseTo((400_000 / 9) * 3, 1);
    const own = buildCommitments([], null, roster, attendance, { ...cfg, nominationReservePhp: 250_000 });
    expect(own).toMatchObject({ nominations: 250_000, nominationsEstimated: false });
    expect(own.byMonth.slice(9)).toEqual([83_333.33, 83_333.33, 83_333.33]); // spread over Oct-Dec
  });

  it("never lands a commitment in or before the as-of month", () => {
    const late = { ...cfg, asOfDate: "2026-10-20", nominationReservePhp: 0 };
    const c = buildCommitments([run("OCT", "2026-10-25", { expected_pax: 10 })], null, roster, attendance, late);
    expect(c.byMonth[9]).toBe(0);
    expect(c.byMonth[10]).toBe(c.runs[0].cost); // pushed to the next month
  });

  it("projects spend into the burn-down line", () => {
    const c = buildCommitments(calendar, null, roster, attendance, { ...cfg, nominationReservePhp: 0 });
    const report = budgetSeries(roster, attendance, cfg, undefined, c.byMonth);
    expect(report.months[9].planned).toBe(400_000 + 8500);
    expect(report.months[11].planned).toBe(400_000 + 38_500);
  });
});

describe("subscriptions", () => {
  it("count as spend from January", () => {
    const subs = [{ name: "Canva, 5 seats", amountPhp: 32_500 }, { name: "Adobe", amountPhp: 40_500 }];
    const report = budgetSeries([emp("A")], [], config({ budgetPhp: 500_000, subscriptions: subs }));
    expect(report.subscriptions).toBe(73_000);
    expect(report.months[0].spent).toBe(73_000);
    expect(report.spent).toBe(73_000);
    expect(report.remaining).toBe(427_000);
  });
});

describe("realistic balance in the analysis", () => {
  it("projects the balance from spend, commitments and the plan, and equals cost.remaining", () => {
    const roster = [
      ...Array.from({ length: 2 }, (_, i) => emp(`L${i}`, { licensed: "yes" })),
      ...Array.from({ length: 10 }, (_, i) => emp(`U${i}`, { licensed: "no" })),
    ];
    const cfg = config({ budgetPhp: 1_000_000, nominationReservePhp: 20_000 });
    const linkedin = { ...course("LL", "linkedin_learning", 90, 0), unlicensed_fee: 800 };
    const calendar = [run("IH", "2026-10-15", { hours: 4, speakers: 1, min_pax: 4, max_pax: 12, expected_pax: 10 })];
    const a = runAnalysis({
      roster,
      attendance: [att("L0", "2026-02-02", { cost: 100_000 })],
      catalog: [linkedin],
      calendar,
      config: cfg,
    });
    // The run takes the 10 unlicensed people: ₱500 × 2 + ₱75 × 10 = ₱1,750, inside the calendar commitment.
    expect(a.cost?.costToClose).toBe(1750);
    expect(a.outlook.commitments.calendar).toBe(1750);
    expect(a.budget.remaining).toBe(900_000);
    expect(a.outlook.projectedBalance).toBe(900_000 - 1750 - 20_000);
    expect(a.cost?.remaining).toBe(a.outlook.projectedBalance);
    expect(a.outlook.projectedPct).toBe(87.8);
  });
});

describe("sample calendar", () => {
  const read = (name: string) => readFileSync(`public/sample/${name}.csv`, "utf8");
  const parsed = validateCsv("calendar", read("calendar"));

  it("is valid and mixes external and in-house runs 3 to 1", () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const external = parsed.rows.filter((r) => r.delivery === "external").length;
    const inHouse = parsed.rows.filter((r) => r.delivery === "in_house").length;
    expect([external, inHouse]).toEqual([12, 4]);
    expect(external).toBe(inHouse * 3);
  });

  it("prices ITIL Foundation at ₱18,000 per participant", () => {
    if (!parsed.ok) throw new Error("calendar invalid");
    const itil = parsed.rows.filter((r) => r.run_title === "ITIL 4 Foundation");
    expect(itil.length).toBeGreaterThan(0);
    expect(itil.every((r) => r.cost_per_head === 18_000)).toBe(true);
  });

  it("leaves a realistic balance of under 10% of the allocation with the sample preset", () => {
    const get = (k: "roster" | "attendance" | "catalog" | "calendar") => {
      const r = validateCsv(k, read(k));
      if (!r.ok) throw new Error(`${k} invalid`);
      return r.rows as never[];
    };
    const cfg = { ...defaultRulesConfig("2026-09-30"), budgetPhp: 2_500_000 };
    const a = runAnalysis({
      roster: get("roster"),
      attendance: get("attendance"),
      catalog: get("catalog"),
      calendar: get("calendar"),
      config: cfg,
    });
    expect(a.outlook.projectedPct).toBeGreaterThan(0);
    expect(a.outlook.projectedPct).toBeLessThan(10);
  });
});
