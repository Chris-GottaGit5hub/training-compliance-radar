import Papa from "papaparse";
import type { ZodType } from "zod";
import {
  ATTENDANCE_COLUMNS,
  CALENDAR_COLUMNS,
  CATALOG_COLUMNS,
  OPTIONAL_COLUMNS,
  ROSTER_COLUMNS,
  attendanceRowSchema,
  calendarRowSchema,
  catalogRowSchema,
  rosterRowSchema,
  type AttendanceRow,
  type CalendarRow,
  type CatalogRow,
  type RosterRow,
} from "./rows";

export const CSV_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxRows: 20_000,
  maxShownErrors: 20,
} as const;

export type CsvKind = "roster" | "attendance" | "catalog" | "calendar";

interface RowByKind {
  roster: RosterRow;
  attendance: AttendanceRow;
  catalog: CatalogRow;
  calendar: CalendarRow;
}

/** `row` is the spreadsheet row number (header = row 1); null = whole-file issue. */
export interface CsvIssue {
  row: number | null;
  field?: string;
  message: string;
}

export type CsvResult<T> =
  | { ok: true; rows: T[]; warnings: string[] }
  | { ok: false; errors: CsvIssue[]; totalErrors: number };

const SPECS: Record<
  CsvKind,
  { schema: ZodType; columns: readonly string[]; uniqueKey?: string }
> = {
  roster: { schema: rosterRowSchema, columns: ROSTER_COLUMNS, uniqueKey: "employee_id" },
  attendance: { schema: attendanceRowSchema, columns: ATTENDANCE_COLUMNS },
  catalog: { schema: catalogRowSchema, columns: CATALOG_COLUMNS, uniqueKey: "course_id" },
  calendar: { schema: calendarRowSchema, columns: CALENDAR_COLUMNS, uniqueKey: "run_id" },
};

function fail(errors: CsvIssue[]): CsvResult<never> {
  return {
    ok: false,
    errors: errors.slice(0, CSV_LIMITS.maxShownErrors),
    totalErrors: errors.length,
  };
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) (seen.has(v) ? dupes : seen).add(v);
  return [...dupes];
}

function listIds(ids: string[]): string {
  const shown = ids.slice(0, 20).join(", ");
  return ids.length > 20 ? `${shown} and ${ids.length - 20} more` : shown;
}

function caseOnlyUnitConflicts(rows: RosterRow[]): string[] {
  const byLower = new Map<string, Set<string>>();
  for (const { unit } of rows) {
    const key = unit.toLowerCase();
    byLower.set(key, (byLower.get(key) ?? new Set()).add(unit));
  }
  return [...byLower.values()].filter((s) => s.size > 1).map((s) => [...s].join(" / "));
}

function duplicateAttendanceCount(rows: AttendanceRow[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of rows) {
    const key = [r.employee_id, r.training_title, r.training_date].join("\u0000");
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  return dupes;
}

/**
 * Validates one CSV file's text (spec §2.5, §4.3). Pure: no I/O. Normalizes the
 * BOM, header case, cell whitespace and enum case; returns typed rows or the
 * first 20 row-numbered errors.
 */
export function validateCsv<K extends CsvKind>(
  kind: K,
  text: string,
): CsvResult<RowByKind[K]> {
  const spec = SPECS[kind];

  if (new TextEncoder().encode(text).length > CSV_LIMITS.maxBytes) {
    return fail([{ row: null, message: "File is larger than 5 MB." }]);
  }

  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    delimiter: ",",
    skipEmptyLines: false,
  });
  const table = parsed.data;
  const isBlank = (cells: string[]) => cells.every((c) => c.trim() === "");

  if (table.length === 0 || isBlank(table[0])) {
    return fail([{ row: null, message: "File is empty or has no header row." }]);
  }

  const headers = table[0].map((h) => h.trim().toLowerCase());
  const missing = spec.columns.filter(
    (c) => !OPTIONAL_COLUMNS[kind].includes(c) && !headers.includes(c),
  );
  if (missing.length > 0) {
    return fail([
      { row: null, message: `Missing required column(s): ${missing.join(", ")}.` },
    ]);
  }

  const dataRows: { rowNum: number; cells: string[] }[] = [];
  for (let i = 1; i < table.length; i++) {
    if (!isBlank(table[i])) dataRows.push({ rowNum: i + 1, cells: table[i] });
  }
  if (dataRows.length > CSV_LIMITS.maxRows) {
    return fail([
      {
        row: null,
        message: `File has ${dataRows.length} rows; the limit is ${CSV_LIMITS.maxRows}.`,
      },
    ]);
  }

  const rowErrors: CsvIssue[] = parsed.errors
    .filter((e) => e.type === "Quotes")
    .map((e) => ({ row: (e.row ?? 0) + 1, message: e.message }));
  const rows: RowByKind[K][] = [];
  const keys: string[] = [];

  for (const { rowNum, cells } of dataRows) {
    const obj: Record<string, string | undefined> = {};
    for (const col of spec.columns) {
      const idx = headers.indexOf(col);
      const cell = idx >= 0 ? cells[idx]?.trim() : undefined;
      obj[col] = cell === "" ? undefined : cell;
    }
    const key = spec.uniqueKey ? obj[spec.uniqueKey] : undefined;
    if (key !== undefined) keys.push(key);
    const result = spec.schema.safeParse(obj);
    if (result.success) {
      rows.push(result.data as RowByKind[K]);
      continue;
    }
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "");
      rowErrors.push({ row: rowNum, field, message: `${field} ${issue.message}` });
    }
  }

  const globalErrors: CsvIssue[] = [];
  const dupes = findDuplicates(keys);
  if (spec.uniqueKey && dupes.length > 0) {
    globalErrors.push({
      row: null,
      field: spec.uniqueKey,
      message: `Duplicate ${spec.uniqueKey}: ${listIds(dupes)}.`,
    });
  }

  if (kind === "roster") {
    const numbers = (rows as RosterRow[]).flatMap((r) => (r.personnel_number ? [r.personnel_number] : []));
    const repeated = findDuplicates(numbers);
    if (repeated.length > 0) {
      globalErrors.push({
        row: null,
        field: "personnel_number",
        message: `Duplicate personnel_number: ${listIds(repeated)}.`,
      });
    }
  }

  const errors = [...globalErrors, ...rowErrors];
  if (errors.length > 0) return fail(errors);

  const warnings: string[] = [];
  if (kind === "roster") {
    for (const names of caseOnlyUnitConflicts(rows as RosterRow[])) {
      warnings.push(`Unit names differ only by letter case: ${names}.`);
    }
  }
  if (kind === "attendance") {
    const dupes = duplicateAttendanceCount(rows as AttendanceRow[]);
    if (dupes > 0) warnings.push(`${dupes} duplicate attendance row(s) will be counted once.`);
  }
  return { ok: true, rows, warnings };
}
