import { MILESTONE_POINTS, type EmployeeResult } from "@/lib/engine";
import type { RulesConfig } from "@/lib/schemas/config";
import type { AttendanceRow, CatalogRow, RosterRow } from "@/lib/schemas/rows";
import { UNASSIGNED } from "./breakdown";
import { lastDayOfMonth } from "./budget";

/** A sector holding more than this share of in-scope staff is scheduled group by group. */
export const SPLIT_SHARE = 0.3;

/** The first recommended LinkedIn course by course_id (spec §4.8 supports one). */
export function recommendedCourse(catalog: readonly CatalogRow[] | null): CatalogRow | null {
  const found = (catalog ?? [])
    .filter((c) => c.recommended === "yes" && c.provider === "linkedin_learning")
    .sort((a, b) => (a.course_id < b.course_id ? -1 : a.course_id > b.course_id ? 1 : 0));
  return found[0] ?? null;
}

export interface ScheduleUnit {
  unit: string;
  size: number;
}

export interface ScheduleScheme {
  units: ScheduleUnit[];
  /** The scheduling unit an employee belongs to (a sector, or `Sector · Group` when split). */
  label: (emp: RosterRow) => string;
}

const inScope = (r: EmployeeResult): boolean => r.status === "COMPLIANT" || r.status === "AT_RISK";
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Scheduling units from in-scope staff. Empty when the roster has no sector column filled in. */
export function scheduleUnits(
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
): ScheduleScheme {
  const byId = new Map(roster.map((r) => [r.employee_id, r]));
  const scoped = results.filter(inScope);
  const sectorSize = new Map<string, number>();
  for (const r of scoped) {
    const sector = byId.get(r.employeeId)?.sector ?? UNASSIGNED;
    sectorSize.set(sector, (sectorSize.get(sector) ?? 0) + 1);
  }
  const split = new Set(
    [...sectorSize].filter(([, n]) => n / scoped.length > SPLIT_SHARE).map(([sector]) => sector),
  );
  const label = (emp: RosterRow): string => {
    const sector = emp.sector ?? UNASSIGNED;
    return split.has(sector) ? `${sector} · ${emp.group ?? UNASSIGNED}` : sector;
  };

  if (!roster.some((r) => r.sector !== undefined)) return { units: [], label };
  const sizes = new Map<string, number>();
  for (const r of scoped) {
    const emp = byId.get(r.employeeId);
    if (emp) sizes.set(label(emp), (sizes.get(label(emp)) ?? 0) + 1);
  }
  return { units: [...sizes].map(([unit, size]) => ({ unit, size })), label };
}

export interface SectorWindow {
  unit: string;
  month: number;
  start: string;
  end: string;
  size: number;
}

export interface WindowPlan {
  windows: SectorWindow[];
  /** Largest single-month load as a share of in-scope staff (0-1). */
  peakShare: number;
  /** Whether the windows ending before each milestone cover its target. */
  reachable: boolean;
}

/** Spec §4.8: one whole-month window per unit, spread over Feb-Oct, packed from January if targets need it. */
export function planSectorWindows(units: readonly ScheduleUnit[], config: RulesConfig): WindowPlan {
  const sorted = [...units].sort((a, b) => b.size - a.size || byText(a.unit, b.unit));
  const n = sorted.length;
  const total = sorted.reduce((sum, u) => sum + u.size, 0);

  const build = (monthOf: (i: number) => number): SectorWindow[] =>
    sorted.map((u, i) => {
      const month = monthOf(i);
      const mm = String(month).padStart(2, "0");
      const last = String(lastDayOfMonth(config.year, month)).padStart(2, "0");
      return { unit: u.unit, month, start: `${config.year}-${mm}-01`, end: `${config.year}-${mm}-${last}`, size: u.size };
    });

  const reaches = (windows: SectorWindow[]): boolean =>
    MILESTONE_POINTS.every(({ monthDay }, k) => {
      const date = `${config.year}-${monthDay}`;
      const done = windows.filter((w) => w.end <= date).reduce((sum, w) => sum + w.size, 0);
      return done >= Math.ceil(((config.milestoneTargets[k] ?? 0) * total) / 100 - 1e-9);
    });

  const spread = build((i) => 2 + Math.floor((i * 9) / n));
  const packed = build((i) => (n <= 10 ? i + 1 : 1 + Math.floor((i * 10) / n)));
  const windows = reaches(spread) ? spread : reaches(packed) ? packed : spread;

  const load = new Map<number, number>();
  for (const w of windows) load.set(w.month, (load.get(w.month) ?? 0) + w.size);
  return {
    windows,
    peakShare: total === 0 ? 0 : Math.max(0, ...load.values()) / total,
    reachable: reaches(windows),
  };
}

export type WindowState = "upcoming" | "open" | "closed";

export interface WindowRow extends SectorWindow {
  state: WindowState;
  completed: number;
  pending: number;
  /** Still without the course after the window closed: they wait for next year. */
  missed: number;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Spec §4.8: completions of the recommended course inside each window. Counts only. */
export function windowStatus(
  windows: readonly SectorWindow[],
  scheme: ScheduleScheme,
  course: CatalogRow,
  results: readonly EmployeeResult[],
  roster: readonly RosterRow[],
  attendance: readonly AttendanceRow[],
  asOfDate: string,
): WindowRow[] {
  const byId = new Map(roster.map((r) => [r.employee_id, r]));
  const dates = new Map<string, string[]>();
  for (const row of attendance) {
    if (norm(row.training_title) !== norm(course.title) || row.training_date > asOfDate) continue;
    dates.set(row.employee_id, [...(dates.get(row.employee_id) ?? []), row.training_date]);
  }
  const byUnit = new Map(windows.map((w) => [w.unit, w]));
  const completed = new Map<string, number>();
  for (const r of results.filter(inScope)) {
    const emp = byId.get(r.employeeId);
    const w = emp ? byUnit.get(scheme.label(emp)) : undefined;
    if (!w || !dates.get(r.employeeId)?.some((d) => d >= w.start && d <= w.end)) continue;
    completed.set(w.unit, (completed.get(w.unit) ?? 0) + 1);
  }

  return windows.map((w) => {
    const state: WindowState = asOfDate < w.start ? "upcoming" : asOfDate > w.end ? "closed" : "open";
    const done = completed.get(w.unit) ?? 0;
    const remaining = w.size - done;
    return {
      ...w,
      state,
      completed: done,
      pending: state === "closed" ? 0 : remaining,
      missed: state === "closed" ? remaining : 0,
    };
  });
}
