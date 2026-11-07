import { describe, expect, it } from "vitest";
import { atRiskEmployees, runAnalysis } from "@/lib/analysis";
import { evaluateRoster } from "@/lib/engine";
import { att, config, course, emp } from "./helpers/fixtures";

const roster = [
  emp("A1", { unit: "Alpha", name: "Zed", licensed: "yes" }), // at risk
  emp("A2", { unit: "Alpha", name: "Amy", licensed: "no" }), // at risk
  emp("A3", { unit: "Alpha" }), // compliant
  emp("B1", { unit: "Beta", name: "Bo", position: "Clerk" }), // at risk
  emp("B2", { unit: "Beta", separation_date: "2026-01-31" }), // excluded
];
const attendance = [att("A3", "2026-03-01")];

describe("runAnalysis", () => {
  const catalog = [course("LL", "linkedin_learning", 90, 0), course("IH", "in_house", 120, 700)];

  it("matches the engine and prices the cost to close", () => {
    const a = runAnalysis({ roster, attendance, catalog, config: config({ budgetPhp: 1000 }) });
    expect(a.results).toEqual(evaluateRoster(roster, attendance, config()).results);
    expect(a.org).toMatchObject({ covered: 4, compliant: 1, atRisk: 3 });
    expect(a.cost).toEqual({ costToClose: 700, unpricedCount: 0, remaining: 300, covered: true });
  });

  it("has no cost when there is no catalog (or an empty one)", () => {
    expect(runAnalysis({ roster, attendance, catalog: null, config: config() }).cost).toBeNull();
    expect(runAnalysis({ roster, attendance, catalog: [], config: config() }).cost).toBeNull();
  });

  it("runs the back-test at Jun 30 and Sep 30 of the config year", () => {
    const a = runAnalysis({ roster, attendance, catalog: null, config: config({ year: 2026 }) });
    expect(a.backtests.map((b) => [b.label, b.checkpoint])).toEqual([
      ["Jun 30", "2026-06-30"],
      ["Sep 30", "2026-09-30"],
    ]);
    expect(a.backtests[0].result.flaggedAtCheckpoint).toBe(3);
  });

  it("passes engine warnings through", () => {
    const a = runAnalysis({
      roster,
      attendance: [...attendance, att("NOBODY", "2026-02-02")],
      catalog: null,
      config: config(),
    });
    expect(a.warnings.orphanAttendanceRows).toBe(1);
  });
});

describe("atRiskEmployees", () => {
  const { results } = evaluateRoster(roster, attendance, config());

  it("lists only AT_RISK employees with roster details, sorted by unit then name", () => {
    expect(atRiskEmployees(results, roster).map((r) => r.employeeId)).toEqual(["A2", "A1", "B1"]);
    expect(atRiskEmployees(results, roster)[0]).toEqual({
      employeeId: "A2",
      name: "Amy",
      unit: "Alpha",
      position: "Officer",
      employmentType: "regular",
      licensed: false,
      hireDate: "2020-01-01",
    });
  });

  it("filters to one unit", () => {
    expect(atRiskEmployees(results, roster, "Beta").map((r) => r.name)).toEqual(["Bo"]);
    expect(atRiskEmployees(results, roster, "Nowhere")).toEqual([]);
  });
});
