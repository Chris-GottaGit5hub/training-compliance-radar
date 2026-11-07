import { describe, expect, it } from "vitest";
import {
  complianceRate,
  deadlineOf,
  evaluateRoster,
  monthsRemaining,
  rankUnits,
  summarizeOrg,
  summarizeUnits,
  todayManila,
} from "@/lib/engine";
import { att, config, emp, unitSummary } from "./helpers/fixtures";

describe("monthsRemaining", () => {
  it("is 12 minus the month of asOfDate", () => {
    expect(monthsRemaining("2026-01-15")).toBe(11);
    expect(monthsRemaining("2026-09-01")).toBe(3);
    expect(monthsRemaining("2026-09-30")).toBe(3);
    expect(monthsRemaining("2026-12-15")).toBe(0);
  });

  it("derives the deadline as Dec 31", () => {
    expect(deadlineOf(2026)).toBe("2026-12-31");
  });
});

describe("todayManila", () => {
  it("uses Philippine time, not UTC", () => {
    expect(todayManila(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
    expect(todayManila(new Date("2026-06-15T10:00:00Z"))).toBe("2026-06-15");
  });
});

describe("complianceRate", () => {
  it("rounds half-up to one decimal", () => {
    expect(complianceRate(1, 16)).toBe(6.3); // 6.25
    expect(complianceRate(2, 3)).toBe(66.7);
    expect(complianceRate(1, 8)).toBe(12.5);
    expect(complianceRate(5, 5)).toBe(100);
  });

  it("is 0 when nobody is covered", () => {
    expect(complianceRate(0, 0)).toBe(0);
  });
});

describe("summarizeUnits and summarizeOrg", () => {
  const roster = [
    emp("A1", { unit: "Alpha", licensed: "yes" }), // compliant
    emp("A2", { unit: "Alpha", licensed: "yes" }), // at risk, licensed
    emp("A3", { unit: "Alpha", licensed: "no" }), // at risk, unlicensed
    emp("A4", { unit: "Alpha", hire_date: "2026-11-01" }), // not yet hired
    emp("B1", { unit: "Beta", separation_date: "2026-02-01" }), // excluded
    emp("B2", { unit: "Beta" }), // at risk
  ];
  const attendance = [att("A1", "2026-04-01")];
  const cfg = config();
  const { results } = evaluateRoster(roster, attendance, cfg);

  it("counts covered, at-risk and licensed split per unit", () => {
    const units = summarizeUnits(results, roster);
    expect(units.find((u) => u.unit === "Alpha")).toEqual({
      unit: "Alpha",
      covered: 3,
      compliant: 1,
      atRisk: 2,
      atRiskLicensed: 1,
      atRiskUnlicensed: 1,
      complianceRate: 33.3,
    });
    expect(units.find((u) => u.unit === "Beta")).toMatchObject({ covered: 1, atRisk: 1 });
  });

  it("builds the org summary with ranked units", () => {
    const org = summarizeOrg(results, roster, cfg);
    expect(org).toMatchObject({
      covered: 4,
      compliant: 1,
      atRisk: 3,
      exempt: 0,
      excluded: 1,
      notCovered: 1,
      complianceRate: 25,
      monthsRemaining: 3,
      deadline: "2026-12-31",
    });
    expect(org.unitsRanked.map((u) => u.unit)).toEqual(["Alpha", "Beta"]);
  });
});

describe("rankUnits", () => {
  const names = (units: ReturnType<typeof rankUnits>) => units.map((u) => u.unit);

  it("orders by atRisk desc, then compliance asc, then name asc", () => {
    const ranked = rankUnits([
      unitSummary("Beta", 5, 5),
      unitSummary("Gamma", 15, 5),
      unitSummary("Delta", 0, 8),
      unitSummary("Alpha", 5, 5),
    ]);
    expect(names(ranked)).toEqual(["Delta", "Alpha", "Beta", "Gamma"]);
  });

  it("breaks ties on the unrounded rate, not the rounded one", () => {
    const low = unitSummary("Zulu", 1000, 15); // 98.5222...%
    const high = unitSummary("Alpha", 1001, 15); // 98.5256...%
    expect(complianceRate(low.compliant, low.covered)).toBe(
      complianceRate(high.compliant, high.covered),
    );
    expect(names(rankUnits([high, low]))).toEqual(["Zulu", "Alpha"]);
  });

  it("sorts names by code point, not locale", () => {
    const ranked = rankUnits([unitSummary("alpha", 1, 1), unitSummary("Zeta", 1, 1)]);
    expect(names(ranked)).toEqual(["Zeta", "alpha"]);
  });

  it("does not mutate its input", () => {
    const input = [unitSummary("B", 0, 1), unitSummary("A", 0, 2)];
    rankUnits(input);
    expect(names(input)).toEqual(["B", "A"]);
  });
});
