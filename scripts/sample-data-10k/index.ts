import { ATTENDANCE_COLUMNS, CATALOG_COLUMNS } from "../../lib/schemas/rows";
import { buildCatalog } from "../sample-data/catalog";
import { createRng } from "../sample-data/rng";
import { buildAttendance10k } from "./attendance";
import { PERSONNEL_COLUMNS, buildPersonnel, departmentRisk } from "./roster";

export const SEED_10K = 20261123;

export function toCsv(columns: readonly string[], rows: readonly object[]): string {
  const cell = (value: unknown): string => {
    const s = value === undefined || value === null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = rows.map((row) => columns.map((c) => cell((row as Record<string, unknown>)[c])).join(","));
  return [columns.join(","), ...lines].join("\n") + "\n";
}

/** The three CSV files (roster, attendance, catalog) for the 10k synthetic set. */
export function build10kDataset(year: number, seed = SEED_10K, total = 10_000) {
  const rng = createRng(seed);
  const personnel = buildPersonnel(rng, year, total);
  const attendance = buildAttendance10k(rng, personnel, year, departmentRisk);
  const catalog = buildCatalog();
  return {
    personnel,
    attendance,
    catalog,
    files: {
      roster: toCsv(PERSONNEL_COLUMNS, personnel),
      attendance: toCsv(ATTENDANCE_COLUMNS, attendance),
      catalog: toCsv(CATALOG_COLUMNS, catalog),
    },
  };
}
