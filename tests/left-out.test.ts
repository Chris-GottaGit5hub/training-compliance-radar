import { describe, expect, it } from "vitest";
import { evaluateRoster } from "@/lib/engine";
import { budgetSeries, leftOutSummary } from "@/lib/analysis";
import { defaultRulesConfig, validateCsv } from "@/lib/schemas";
import { ROSTER_HEADER, att, emp } from "./helpers/fixtures";

const roster = [
  emp("R1"), // regular, untrained: at risk
  emp("R2"), // regular, trained
  emp("C1", { employment_type: "contractual" }), // never at risk by default
  emp("C2", { employment_type: "contractual" }),
  emp("S1", { separation_date: "2026-03-01" }), // separated
  emp("N1", { hire_date: "2026-10-12" }), // hired after the as-of date
  emp("N2", { hire_date: "2026-11-02", employment_type: "contractual" }), // not yet hired wins over type
];
const cfg = defaultRulesConfig("2026-09-30"); // regular only
const attendance = [att("R2", "2026-02-02", { cost: 900 }), att("C1", "2026-04-04", { cost: 1500 })];
const { results } = evaluateRoster(roster, attendance, cfg);

describe("default rules: only regular staff are at risk", () => {
  it("defaults coveredTypes to regular", () => {
    expect(cfg.coveredTypes).toEqual(["regular"]);
  });

  it("never puts contractual staff at risk, trained or not", () => {
    const status = (id: string) => results.find((r) => r.employeeId === id)?.status;
    expect(status("R1")).toBe("AT_RISK");
    expect(status("C1")).toBe("NOT_COVERED");
    expect(status("C2")).toBe("NOT_COVERED");
  });

  it("still counts the cost of a contractual employee who attended", () => {
    expect(budgetSeries(roster, attendance, cfg).spent).toBe(2400);
  });
});

describe("leftOutSummary", () => {
  it("lists each reason with its count, separated first", () => {
    expect(leftOutSummary(results, roster)).toEqual([
      { label: "separated", count: 1 },
      { label: "not yet hired", count: 2 },
      { label: "contractual staff (type not covered)", count: 2 },
    ]);
  });

  it("names exempt late hires and omits reasons with no one", () => {
    const later = { ...cfg, asOfDate: "2026-11-30" };
    const res = evaluateRoster(roster, attendance, later).results;
    const items = leftOutSummary(res, roster);
    expect(items.map((i) => i.label)).toEqual([
      "separated",
      "contractual staff (type not covered)",
      "late hires (exempt)",
    ]);
    expect(items.find((i) => i.label === "late hires (exempt)")?.count).toBe(1);
  });

  it("is empty when everyone is in scope", () => {
    const all = [emp("A"), emp("B")];
    expect(leftOutSummary(evaluateRoster(all, [], cfg).results, all)).toEqual([]);
  });
});

describe("employment types", () => {
  const row = (type: string) => `E1,Name,Ops,Officer,${type},2020-01-01,,yes`;

  it("accepts regular and contractual", () => {
    expect(validateCsv("roster", `${ROSTER_HEADER}\n${row("Regular")}\nE2,N,Ops,O,contractual,2020-01-01,,no`).ok).toBe(true);
  });

  it("rejects casual and names the allowed values", () => {
    const res = validateCsv("roster", `${ROSTER_HEADER}\n${row("casual")}`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0].message).toContain("regular, contractual");
  });
});
