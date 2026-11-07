import type { AtRiskRow } from "./analysis";

const HEADER = [
  "employee_id",
  "name",
  "unit",
  "position",
  "employment_type",
  "licensed",
  "hire_date",
] as const;

const FORMULA_START = /^[=+\-@\t\r]/;

/** Escapes one CSV cell, neutralizing spreadsheet formulas (spec §4.4). */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** UTF-8 CSV with a BOM so Excel shows names correctly; CRLF line endings. */
export function buildAtRiskCsv(rows: readonly AtRiskRow[]): string {
  const lines = rows.map((r) =>
    [
      r.employeeId,
      r.name,
      r.unit,
      r.position,
      r.employmentType,
      r.licensed ? "yes" : "no",
      r.hireDate,
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}

/** e.g. at-risk-branch-operations-2026-09-30.csv; `label` null means all units. */
export function exportFileName(label: string | null, asOfDate: string): string {
  const slug =
    (label ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "all-units";
  return `at-risk-${slug}-${asOfDate}.csv`;
}
