import { describe, expect, it } from "vitest";
import { CSV_LIMITS, validateCsv, type CsvResult } from "@/lib/schemas";
import { ATTENDANCE_HEADER, CATALOG_HEADER, ROSTER_HEADER } from "./helpers/fixtures";

const rosterLine = (id: string, extra = "") =>
  `${id},Ana Cruz,IT,Developer,regular,2020-01-05,,yes${extra}`;
const roster = (...lines: string[]) => [ROSTER_HEADER, ...lines].join("\n") + "\n";

function errorsOf(result: CsvResult<unknown>) {
  if (result.ok) throw new Error("expected validation to fail");
  return result;
}

describe("validateCsv: happy path and normalization", () => {
  it("accepts a valid roster", () => {
    const result = validateCsv("roster", roster(rosterLine("E1"), rosterLine("E2")));
    expect(result).toMatchObject({ ok: true, warnings: [] });
    expect(result.ok && result.rows).toHaveLength(2);
  });

  it("strips the BOM, trims cells, lower-cases headers and enums", () => {
    const text =
      "﻿ Employee_ID , NAME ,Unit,Position,Employment_Type,Hire_Date,Separation_Date,Licensed\n" +
      "  E1 , Ana Cruz ,IT,Dev, Contractual ,2020-01-05, ,YES\n";
    const result = validateCsv("roster", text);
    expect(result.ok && result.rows[0]).toEqual({
      employee_id: "E1",
      name: "Ana Cruz",
      unit: "IT",
      position: "Dev",
      employment_type: "contractual",
      hire_date: "2020-01-05",
      separation_date: undefined,
      licensed: "yes",
    });
  });

  it("ignores unknown extra columns, blank lines and a missing optional column", () => {
    const text =
      "employee_id,name,unit,position,employment_type,hire_date,licensed,notes\n" +
      "E1,Ana,IT,Dev,regular,2020-01-05,no,hello\n\n";
    const result = validateCsv("roster", text);
    expect(result.ok && result.rows).toHaveLength(1);
  });

  it("parses attendance numbers and catalog urls", () => {
    const attendance = validateCsv(
      "attendance",
      `${ATTENDANCE_HEADER}\nE1,"Ethics, Part 1",2026-03-01,1.5,elearning,0\n`,
    );
    expect(attendance.ok && attendance.rows[0]).toMatchObject({
      training_title: "Ethics, Part 1",
      hours: 1.5,
    });
    const catalog = validateCsv(
      "catalog",
      `${CATALOG_HEADER}\nC1,T,S,60,in_house,,500\nC2,T,S,30,linkedin_learning,https://example.com/x,0\n`,
    );
    expect(catalog.ok && catalog.rows.map((r) => r.url)).toEqual([
      undefined,
      "https://example.com/x",
    ]);
  });
});

describe("validateCsv: file-level errors", () => {
  it("names every missing required column", () => {
    const result = errorsOf(
      validateCsv("attendance", "employee_id,hours\nE1,2\n"),
    );
    expect(result.errors).toEqual([
      {
        row: null,
        message: "Missing required column(s): training_title, training_date, delivery, cost.",
      },
    ]);
  });

  it("rejects an empty file", () => {
    expect(errorsOf(validateCsv("roster", "")).errors[0].message).toMatch(/empty/i);
    expect(errorsOf(validateCsv("roster", "\n\n")).errors[0].message).toMatch(/empty/i);
  });

  it("rejects more than 20,000 rows", () => {
    const lines = Array.from({ length: CSV_LIMITS.maxRows + 1 }, (_, i) => rosterLine(`E${i}`));
    const result = errorsOf(validateCsv("roster", roster(...lines)));
    expect(result.errors[0].message).toContain("20000");
  });

  it("accepts exactly 20,000 rows", () => {
    const lines = Array.from({ length: CSV_LIMITS.maxRows }, (_, i) => rosterLine(`E${i}`));
    expect(validateCsv("roster", roster(...lines)).ok).toBe(true);
  });

  it("rejects files over 5 MB", () => {
    const big = "a".repeat(CSV_LIMITS.maxBytes + 1);
    expect(errorsOf(validateCsv("roster", big)).errors[0].message).toMatch(/5 MB/);
  });
});

describe("validateCsv: row-level errors", () => {
  it("lists duplicate employee_id values and blocks processing (acceptance 6)", () => {
    const result = errorsOf(
      validateCsv("roster", roster(rosterLine("E1"), rosterLine("E2"), rosterLine("E1"), rosterLine("E2"))),
    );
    expect(result.errors[0]).toMatchObject({
      row: null,
      message: "Duplicate employee_id: E1, E2.",
    });
  });

  it("still reports duplicates on rows that have other errors", () => {
    const bad = "E1,Ana,IT,Dev,regular,not-a-date,,yes";
    const result = errorsOf(validateCsv("roster", roster(rosterLine("E1"), bad)));
    expect(result.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining(["Duplicate employee_id: E1."]),
    );
  });

  it("reports duplicate catalog course_id values", () => {
    const text = `${CATALOG_HEADER}\nC1,A,S,60,in_house,,1\nC1,B,S,60,in_house,,1\n`;
    expect(errorsOf(validateCsv("catalog", text)).errors[0].message).toBe(
      "Duplicate course_id: C1.",
    );
  });

  it("flags badly formatted and impossible dates with row numbers", () => {
    const text = roster(
      rosterLine("E1"),
      "E2,Ana,IT,Dev,regular,2026-02-30,,yes", // row 3: Feb 30
      "E3,Ana,IT,Dev,regular,01/05/2020,,yes", // row 4: wrong format
      "E4,Ana,IT,Dev,regular,2025-02-29,,yes", // row 5: not a leap year
      "E5,Ana,IT,Dev,regular,2024-02-29,,yes", // row 6: valid leap day
    );
    const result = errorsOf(validateCsv("roster", text));
    expect(result.errors.map((e) => [e.row, e.field])).toEqual([
      [3, "hire_date"],
      [4, "hire_date"],
      [5, "hire_date"],
    ]);
    expect(result.errors[0].message).toContain("real date");
  });

  it("requires separation_date to be on or after hire_date", () => {
    const text = roster("E1,Ana,IT,Dev,regular,2020-06-01,2020-05-31,yes");
    expect(errorsOf(validateCsv("roster", text)).errors[0]).toMatchObject({
      row: 2,
      field: "separation_date",
      message: "separation_date must be on or after hire_date",
    });
  });

  it("flags missing required values, bad enums and bad numbers", () => {
    const text =
      `${ATTENDANCE_HEADER}\n` +
      ",Ethics,2026-03-01,2,classroom,0\n" + // row 2: employee_id missing
      "E1,Ethics,2026-03-01,-1,classroom,0\n" + // row 3: negative hours
      "E1,Ethics,2026-03-01,2,webinar,0\n" + // row 4: bad delivery
      "E1,Ethics,2026-03-01,abc,classroom,0\n"; // row 5: not a number
    const messages = errorsOf(validateCsv("attendance", text)).errors.map((e) => e.message);
    expect(messages).toEqual([
      "employee_id is required",
      "hours must be 0 or more",
      "delivery must be one of: classroom, elearning, external",
      "hours must be a number",
    ]);
  });

  it("rejects non-https catalog urls and non-positive durations", () => {
    const text = `${CATALOG_HEADER}\nC1,T,S,0,in_house,http://x.com,1\n`;
    const messages = errorsOf(validateCsv("catalog", text)).errors.map((e) => e.message);
    expect(messages).toEqual([
      "duration_minutes must be greater than 0",
      "url must be an https URL",
    ]);
  });

  it("shows only the first 20 errors but reports the total", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `E${i},Ethics,bad-date,2,classroom,0`);
    const result = errorsOf(validateCsv("attendance", `${ATTENDANCE_HEADER}\n${lines.join("\n")}\n`));
    expect(result.errors).toHaveLength(20);
    expect(result.totalErrors).toBe(30);
    expect(result.errors[19].row).toBe(21);
  });
});

describe("validateCsv: warnings", () => {
  it("warns about unit names that differ only by letter case", () => {
    const text = roster(rosterLine("E1"), "E2,Ben,it,Dev,regular,2020-01-05,,yes");
    const result = validateCsv("roster", text);
    expect(result.ok && result.warnings).toEqual([
      "Unit names differ only by letter case: IT / it.",
    ]);
  });

  it("warns about duplicate attendance rows", () => {
    const row = "E1,Ethics,2026-03-01,2,classroom,0";
    const result = validateCsv("attendance", `${ATTENDANCE_HEADER}\n${row}\n${row}\n`);
    expect(result.ok && result.warnings).toEqual([
      "1 duplicate attendance row(s) will be counted once.",
    ]);
  });
});
