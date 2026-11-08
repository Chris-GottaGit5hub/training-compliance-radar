import type { CalendarRun, CalendarWindow, RunState } from "./calendar-view";

/** One course on the timeline: its runs across the year (spec §4.10). */
export interface CourseTimelineRow {
  key: string;
  title: string;
  delivery: CalendarRun["delivery"];
  runs: CalendarRun[];
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Runs grouped by delivery and title: external courses first, then in-house, each
 * alphabetical. Runs keep their date order inside a course.
 */
export function courseTimeline(runs: readonly CalendarRun[]): CourseTimelineRow[] {
  const rows = new Map<string, CourseTimelineRow>();
  for (const run of runs) {
    const key = `${run.delivery}|${run.title}`;
    const row = rows.get(key) ?? { key, title: run.title, delivery: run.delivery, runs: [] };
    row.runs.push(run);
    rows.set(key, row);
  }
  const rank = (d: CalendarRun["delivery"]) => (d === "external" ? 0 : 1);
  return [...rows.values()]
    .map((row) => ({ ...row, runs: [...row.runs].sort((a, b) => byText(a.date, b.date) || byText(a.runId, b.runId)) }))
    .sort((a, b) => rank(a.delivery) - rank(b.delivery) || byText(a.title, b.title));
}

const STATE_RANK: Record<RunState, number> = { planned: 0, standby: 1, completed: 2, blocked: 3 };

/** The most actionable state among runs in one month: planned, standby, completed, blocked. */
export function cellState(runs: readonly CalendarRun[]): RunState {
  return runs.reduce<RunState>((best, r) => (STATE_RANK[r.state] < STATE_RANK[best] ? r.state : best), runs[0]?.state ?? "completed");
}

/** Runs of a course in month `month` (0-11). */
export const runsInMonth = (row: CourseTimelineRow, month: number): CalendarRun[] =>
  row.runs.filter((r) => r.month === month);

export type Quarter = 1 | 2 | 3 | 4;
export const QUARTERS: readonly Quarter[] = [1, 2, 3, 4];

/** Quarter of a month index 0-11. */
export const quarterOfMonth = (month: number): Quarter => (Math.floor(month / 3) + 1) as Quarter;

/** Month indexes (0-11) of a quarter. */
export const quarterMonths = (quarter: Quarter): number[] => [0, 1, 2].map((i) => (quarter - 1) * 3 + i);

/** Still open for sign-up: after the as-of date and on or before Dec 14. */
export const isAvailable = (run: CalendarRun): boolean => run.state === "planned" || run.state === "standby";

/** Estimated seats left: maximum minus expected enrolment, for available runs only. */
export const seatsOpen = (run: CalendarRun): number => (isAvailable(run) ? Math.max(0, run.maxPax - run.expectedPax) : 0);

export interface QuarterSummary {
  quarter: Quarter;
  runs: number;
  external: number;
  inHouse: number;
  seatsOpen: number;
  /** Cost at expected enrolment; runs after Dec 14 are not counted. */
  cost: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Summary of the runs given (already filtered) that fall in `quarter`. */
export function quarterSummary(runs: readonly CalendarRun[], quarter: Quarter): QuarterSummary {
  const here = runs.filter((r) => quarterOfMonth(r.month) === quarter);
  const external = here.filter((r) => r.delivery === "external").length;
  return {
    quarter,
    runs: here.length,
    external,
    inHouse: here.length - external,
    seatsOpen: here.reduce((sum, r) => sum + seatsOpen(r), 0),
    cost: round2(here.filter((r) => r.state !== "blocked").reduce((sum, r) => sum + r.plannedCost, 0)),
  };
}

export interface QuarterCount {
  quarter: Quarter;
  total: number;
  available: number;
}

/** Counts for the four quarter buttons. */
export function quarterCounts(runs: readonly CalendarRun[]): QuarterCount[] {
  return QUARTERS.map((quarter) => {
    const here = runs.filter((r) => quarterOfMonth(r.month) === quarter);
    return { quarter, total: here.length, available: here.filter(isAvailable).length };
  });
}

/** The first quarter from the as-of quarter onward with an available run, else the as-of quarter. */
export function defaultQuarter(runs: readonly CalendarRun[], asOfDate: string): Quarter {
  const start = quarterOfMonth(Number(asOfDate.slice(5, 7)) - 1);
  const counts = quarterCounts(runs);
  return counts.find((c) => c.quarter >= start && c.available > 0)?.quarter ?? start;
}

/** Recommended-course windows (spec §4.8) whose month falls in `quarter`. */
export const windowsInQuarter = (windows: readonly CalendarWindow[], quarter: Quarter): CalendarWindow[] =>
  windows.filter((w) => quarterOfMonth(w.month - 1) === quarter);
