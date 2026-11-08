import {
  ATTENDANCE_COLUMNS,
  CALENDAR_COLUMNS,
  CATALOG_COLUMNS,
} from "../../lib/schemas/rows";
import { buildAttendance } from "./attendance";
import { buildCalendar } from "./calendar";
import { buildCatalog } from "./catalog";
import { createRng } from "./rng";
import { PERSONNEL_COLUMNS, buildPersonnel, departmentRisk } from "./roster";

export const SEED = 20261123;
export const SAMPLE_SIZE = 12_000;

export function toCsv(columns: readonly string[], rows: readonly object[]): string {
  const cell = (value: unknown): string => {
    const s = value === undefined || value === null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = rows.map((row) => columns.map((c) => cell((row as Record<string, unknown>)[c])).join(","));
  return [columns.join(","), ...lines].join("\n") + "\n";
}

/** The four sample CSV files (roster, attendance, catalog, calendar). Deterministic for a seed. */
export function buildSampleDataset(year: number, seed = SEED, total = SAMPLE_SIZE) {
  const rng = createRng(seed);
  const personnel = buildPersonnel(rng, year, total);
  const attendance = buildAttendance(rng, personnel, year, departmentRisk);
  const catalog = buildCatalog();
  const calendar = buildCalendar(year);
  return {
    personnel,
    attendance,
    catalog,
    calendar,
    files: {
      roster: toCsv(PERSONNEL_COLUMNS, personnel),
      attendance: toCsv(ATTENDANCE_COLUMNS, attendance),
      catalog: toCsv(CATALOG_COLUMNS, catalog),
      calendar: toCsv(CALENDAR_COLUMNS, calendar),
    },
  };
}
