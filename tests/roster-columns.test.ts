import { describe, expect, it } from "vitest";
import { parsePayGrade, rulesConfigSchema, validateCsv, defaultRulesConfig } from "@/lib/schemas";
import { ROSTER_HEADER, CATALOG_HEADER } from "./helpers/fixtures";

const WIDE = `${ROSTER_HEADER},pay_grade,group,sector`;
const row = (id: string, tail: string) => `${id},Name ${id},Ops,Officer,regular,2020-01-01,,yes,${tail}`;

describe("optional roster columns", () => {
  it("still accepts the original eight columns", () => {
    const res = validateCsv("roster", `${ROSTER_HEADER}\n${row("1", "").replace(/,$/, "")}`);
    expect(res.ok).toBe(true);
  });

  it("reads pay_grade written as 8, PG8 or PG 8, plus group and sector", () => {
    const text = [WIDE, row("1", "8,G1,S1"), row("2", "PG10,G1,S1"), row("3", "pg 14,G2,S2")].join("\n");
    const res = validateCsv("roster", text);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rows.map((r) => r.pay_grade)).toEqual([8, 10, 14]);
      expect(res.rows[2]).toMatchObject({ group: "G2", sector: "S2" });
    }
  });

  it("allows blank pay_grade, group and sector cells", () => {
    const res = validateCsv("roster", `${WIDE}\n${row("1", ",,")}`);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rows[0].pay_grade).toBeUndefined();
  });

  it("rejects a pay grade that is not a whole number from 1 to 30", () => {
    for (const bad of ["abc", "PG 8.5", "31", "0"]) {
      const res = validateCsv("roster", `${WIDE}\n${row("1", `${bad},G,S`)}`);
      expect(res.ok, bad).toBe(false);
      if (!res.ok) expect(res.errors[0]).toMatchObject({ row: 2, field: "pay_grade" });
    }
  });

  it("parsePayGrade leaves other values for the schema to reject", () => {
    expect(parsePayGrade(" PG 7 ")).toBe(7);
    expect(parsePayGrade("seven")).toBe("seven");
  });
});

describe("optional catalog columns", () => {
  const wide = `${CATALOG_HEADER},unlicensed_fee,recommended`;

  it("reads unlicensed_fee and recommended, which may be blank", () => {
    const text = [wide, "LL-1,AMLA,Compliance,90,linkedin_learning,,0,800,Yes", "IH-1,Ethics,Compliance,240,in_house,,450,,"].join("\n");
    const res = validateCsv("catalog", text);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rows[0]).toMatchObject({ unlicensed_fee: 800, recommended: "yes" });
      expect(res.rows[1].unlicensed_fee).toBeUndefined();
    }
  });

  it("rejects a negative fee", () => {
    const res = validateCsv("catalog", `${wide}\nLL-1,AMLA,Compliance,90,linkedin_learning,,0,-5,no`);
    expect(res.ok).toBe(false);
  });
});

describe("milestoneTargets", () => {
  it("defaults to 25, 50, 85, 100", () => {
    expect(defaultRulesConfig("2026-09-30").milestoneTargets).toEqual([25, 50, 85, 100]);
  });

  it("must be four values from 0 to 100 that do not decrease", () => {
    const base = defaultRulesConfig("2026-09-30");
    expect(rulesConfigSchema.safeParse(base).success).toBe(true);
    for (const bad of [[25, 50, 85], [25, 50, 40, 100], [25, 50, 85, 101], [-1, 50, 85, 100]]) {
      expect(rulesConfigSchema.safeParse({ ...base, milestoneTargets: bad }).success, String(bad)).toBe(false);
    }
  });
});
