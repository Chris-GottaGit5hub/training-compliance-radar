import { describe, expect, it } from "vitest";
import { backtest, costToClose, qualifyingCourses } from "@/lib/engine";
import { att, config, course, emp, result } from "./helpers/fixtures";

describe("backtest", () => {
  const roster = [
    emp("A"), // never trained: at risk at both dates
    emp("B"), // untrained in June, trains in Q4
    emp("C"), // trained early: always compliant
    emp("D", { hire_date: "2026-08-01" }), // hired after the checkpoint, never trained
    emp("E", { separation_date: "2026-11-15" }), // flagged in June, gone by year end
  ];
  const attendance = [att("B", "2026-11-10"), att("C", "2026-02-01")];

  it("counts flagged, year-end non-compliant, caught early and late joiners", () => {
    expect(backtest(roster, attendance, config(), "2026-06-30")).toEqual({
      flaggedAtCheckpoint: 3, // A, B, E
      nonCompliantAtYearEnd: 2, // A, D
      caughtEarly: 1, // A
      notCoveredAtCheckpoint: 1, // D
      recall: 0.5,
      precision: 1 / 3,
    });
  });

  it("ignores config.asOfDate", () => {
    const a = backtest(roster, attendance, config({ asOfDate: "2026-01-31" }), "2026-06-30");
    const b = backtest(roster, attendance, config({ asOfDate: "2026-12-31" }), "2026-06-30");
    expect(a).toEqual(b);
  });

  it("returns null recall and precision when denominators are 0", () => {
    const r = backtest([emp("C")], [att("C", "2026-02-01")], config(), "2026-06-30");
    expect(r).toMatchObject({ flaggedAtCheckpoint: 0, nonCompliantAtYearEnd: 0 });
    expect(r.recall).toBeNull();
    expect(r.precision).toBeNull();
  });

  it("rejects a checkpoint outside the year or on/after the deadline", () => {
    expect(() => backtest(roster, attendance, config(), "2025-06-30")).toThrow(RangeError);
    expect(() => backtest(roster, attendance, config(), "2026-12-31")).toThrow(RangeError);
    expect(() => backtest(roster, attendance, config(), "2026-02-30")).toThrow(RangeError);
  });
});

describe("costToClose", () => {
  const roster = [
    emp("L1", { licensed: "yes" }),
    emp("L2", { licensed: "yes" }),
    emp("U1", { licensed: "no" }),
    emp("OK", { licensed: "no" }),
  ];
  const results = [
    result("L1", "A", "AT_RISK"),
    result("L2", "A", "AT_RISK"),
    result("U1", "A", "AT_RISK"),
    result("OK", "A", "COMPLIANT"),
  ];
  const catalog = [
    course("LL-free", "linkedin_learning", 90, 0),
    course("LL-short", "linkedin_learning", 30, 0),
    course("IH-cheap", "in_house", 60, 500),
    course("IH-long", "in_house", 180, 800),
  ];

  it("prices licensed staff on LinkedIn and unlicensed on in-house", () => {
    expect(costToClose(results, roster, catalog, config({ budgetPhp: 1000 }))).toEqual({
      costToClose: 500,
      unpricedCount: 0,
      remaining: 500,
      covered: true,
    });
  });

  it("flags a budget shortfall", () => {
    const r = costToClose(results, roster, catalog, config({ budgetPhp: 400 }));
    expect(r).toMatchObject({ costToClose: 500, remaining: -100, covered: false });
  });

  it("moves licensed staff to the in-house route when elearningCounts is false", () => {
    const r = costToClose(results, roster, catalog, config({ elearningCounts: false }));
    expect(r.costToClose).toBe(1500); // 3 at-risk x 500
  });

  it("only prices courses that meet minHours", () => {
    const cfg = config({ minHours: 2 });
    expect(qualifyingCourses(catalog, cfg).map((c) => c.course_id)).toEqual(["IH-long"]);
    const r = costToClose(results, roster, catalog, cfg);
    // No qualifying LinkedIn course -> 2 licensed unpriced; U1 uses IH-long.
    expect(r).toMatchObject({ costToClose: 800, unpricedCount: 2, covered: false });
  });

  it("reports unpriced employees when the catalog is empty", () => {
    const r = costToClose(results, roster, [], config({ budgetPhp: 10_000 }));
    expect(r).toEqual({ costToClose: 0, unpricedCount: 3, remaining: 10_000, covered: false });
  });

  it("costs nothing when no one is at risk", () => {
    const r = costToClose([result("OK", "A", "COMPLIANT")], roster, catalog, config());
    expect(r).toMatchObject({ costToClose: 0, unpricedCount: 0, covered: true });
  });
});
