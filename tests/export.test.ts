import { describe, expect, it } from "vitest";
import { buildAtRiskCsv, csvCell, exportFileName, type AtRiskRow } from "@/lib/analysis";

const row = (overrides: Partial<AtRiskRow> = {}): AtRiskRow => ({
  employeeId: "E1",
  name: "Ana Cruz",
  unit: "Finance",
  position: "Accountant",
  employmentType: "regular",
  licensed: true,
  hireDate: "2020-01-05",
  ...overrides,
});

describe("csvCell", () => {
  it("leaves plain text alone", () => {
    expect(csvCell("Ana Cruz")).toBe("Ana Cruz");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    expect(csvCell("Cruz, Ana")).toBe('"Cruz, Ana"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("prefixes formula starters with an apostrophe (acceptance 14)", () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvCell(`${start}SUM(A1)`).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("=1+1")).toBe("'=1+1");
  });

  it("guards first, then quotes", () => {
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });

  it("does not touch a minus sign in the middle of text", () => {
    expect(csvCell("Mary-Ann")).toBe("Mary-Ann");
  });
});

describe("buildAtRiskCsv", () => {
  it("starts with a BOM and the header, then one CRLF line per row", () => {
    const csv = buildAtRiskCsv([row(), row({ employeeId: "E2", licensed: false })]);
    expect(csv.startsWith("﻿employee_id,name,unit,position,employment_type,licensed,hire_date\r\n")).toBe(true);
    expect(csv.split("\r\n")).toEqual([
      "﻿employee_id,name,unit,position,employment_type,licensed,hire_date",
      "E1,Ana Cruz,Finance,Accountant,regular,yes,2020-01-05",
      "E2,Ana Cruz,Finance,Accountant,regular,no,2020-01-05",
      "",
    ]);
  });

  it("writes only the header for an empty list", () => {
    expect(buildAtRiskCsv([])).toBe(
      "﻿employee_id,name,unit,position,employment_type,licensed,hire_date\r\n",
    );
  });

  it("escapes risky names", () => {
    const csv = buildAtRiskCsv([row({ name: "=cmd|' /C calc'!A0" })]);
    expect(csv).toContain(`'=cmd|' /C calc'!A0`);
    expect(csv).not.toMatch(/,=cmd/);
  });
});

describe("exportFileName", () => {
  it("slugs the unit name and appends the as-of date", () => {
    expect(exportFileName("Branch Operations", "2026-09-30")).toBe(
      "at-risk-branch-operations-2026-09-30.csv",
    );
    expect(exportFileName("Info & Tech (IT)/Ops", "2026-09-30")).toBe(
      "at-risk-info-tech-it-ops-2026-09-30.csv",
    );
  });

  it("uses all-units for null or an unsluggable label", () => {
    expect(exportFileName(null, "2026-09-30")).toBe("at-risk-all-units-2026-09-30.csv");
    expect(exportFileName("???", "2026-09-30")).toBe("at-risk-all-units-2026-09-30.csv");
  });
});
