import { MILESTONE_POINTS } from "@/lib/engine";
import type { RulesConfig } from "@/lib/schemas/config";
import type { CalendarRow } from "@/lib/schemas/rows";
import type { Analysis } from "./analysis";
import { MONTH_LABELS } from "./budget";
import { resolveRun, runCost } from "./costing";
import { csvCell } from "./export";
import type { WindowState } from "./windows";

/** A change to the uploaded calendar. The UI does not produce these yet (spec §4.10). */
export type CalendarEdit =
  | { type: "remove"; runId: string }
  | { type: "upsert"; row: CalendarRow };

/**
 * The calendar the view reads: the uploaded rows with any edits applied in order. An empty
 * edit list returns the uploaded rows unchanged. `upsert` replaces a run with the same
 * `run_id` in place, or appends a new one; `remove` drops it.
 */
export function applyCalendarEdits(
  calendar: readonly CalendarRow[],
  edits: readonly CalendarEdit[] = [],
): CalendarRow[] {
  const rows = new Map(calendar.map((r) => [r.run_id, r]));
  for (const edit of edits) {
    if (edit.type === "remove") rows.delete(edit.runId);
    else rows.set(edit.row.run_id, edit.row);
  }
  return [...rows.values()];
}

export type RunState = "completed" | "planned" | "standby" | "blocked";

export interface CalendarRun {
  runId: string;
  courseId: string;
  title: string;
  date: string;
  /** 0-11 */
  month: number;
  delivery: CalendarRow["delivery"];
  hours: number;
  speakers: number;
  minPax: number;
  maxPax: number;
  expectedPax: number;
  /** Fixed cost of holding the run (honoraria for in-house). */
  perRun: number;
  /** Cost per participant (snacks, or the external fee). */
  perHead: number;
  /** Cost at expected enrolment (spec §4.9 costing). */
  plannedCost: number;
  /** Cost per participant when the run is full. */
  fullPerHead: number;
  /** People the plan places in this run (0 unless planned). */
  planPeople: number;
  state: RunState;
  /** Why the plan cancelled a standby run, or why a blocked run cannot run. */
  reason?: string;
}

export interface CalendarSummary {
  total: number;
  completed: number;
  planned: number;
  standby: number;
  blocked: number;
  inHouse: number;
  external: number;
  /** External runs per in-house run; null without in-house runs. */
  ratio: number | null;
  ratioText: string;
  seatsExpected: number;
  seatsCapacity: number;
  /** Cost of every run that can run, at expected enrolment. */
  totalCost: number;
  /** Calendar runs still to run, budgeted (spec §4.7). */
  toBudget: number;
  /** totalCost as a percent of the allocation, 1 decimal; null without an allocation. */
  sharePct: number | null;
  placed: number;
  unplaced: number;
}

export interface CalendarMonth {
  label: string;
  /** 0-11 */
  index: number;
  runs: number;
  inHouseCost: number;
  externalCost: number;
}

export interface CalendarMarker {
  label: string;
  date: string;
  kind: "milestone" | "as-of" | "cutoff" | "deadline";
}

export interface CalendarWindow {
  unit: string;
  /** 1-12 */
  month: number;
  state: WindowState;
  size: number;
}

export interface CalendarAlert {
  tone: "warning" | "info";
  text: string;
}

export interface CalendarView {
  year: number;
  asOfDate: string;
  runs: CalendarRun[];
  summary: CalendarSummary;
  months: CalendarMonth[];
  markers: CalendarMarker[];
  windows: CalendarWindow[];
  alerts: CalendarAlert[];
  /** The company's face-to-face mix, external to in-house. */
  targetRatio: number;
}

export const TARGET_MIX = 3;
const MIX_TOLERANCE = 0.5;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const byDateThenId = (a: CalendarRun, b: CalendarRun): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;

/** Spec §4.10. Pure; reads the plan and outlook already in `analysis`. */
export function buildCalendarView(
  calendar: readonly CalendarRow[],
  analysis: Analysis,
  config: RulesConfig,
  edits: readonly CalendarEdit[] = [],
): CalendarView {
  const effective = applyCalendarEdits(calendar, edits);
  const inYear = effective.filter((r) => r.date.startsWith(`${config.year}-`));
  const outsideYear = effective.length - inYear.length;
  const cutoff = `${config.year}-12-14`;
  const planRuns = new Map((analysis.plan?.runs ?? []).map((r) => [r.runId, r]));

  const runs: CalendarRun[] = inYear
    .map((row): CalendarRun => {
      const resolved = resolveRun(row);
      const decided = planRuns.get(row.run_id);
      let state: RunState;
      let reason: string | undefined;
      if (row.date <= config.asOfDate) state = "completed";
      else if (row.date > cutoff) {
        state = "blocked";
        reason = "after the Dec 14 in-person cutoff";
      } else if (decided?.state === "cancelled") {
        state = "standby";
        reason = decided.reason;
      } else state = "planned";
      return {
        runId: row.run_id,
        courseId: row.course_id,
        title: row.run_title ?? row.course_id,
        date: row.date,
        month: Number(row.date.slice(5, 7)) - 1,
        delivery: row.delivery,
        hours: resolved.hours,
        speakers: resolved.speakers,
        minPax: row.min_pax,
        maxPax: row.max_pax,
        expectedPax: resolved.expectedPax,
        perRun: resolved.perRun,
        perHead: resolved.perHead,
        plannedCost: runCost(resolved, resolved.expectedPax),
        fullPerHead: round2(resolved.perRun / row.max_pax + resolved.perHead),
        planPeople: state === "planned" ? (decided?.participants ?? 0) : 0,
        state,
        reason,
      };
    })
    .sort(byDateThenId);

  const count = (state: RunState) => runs.filter((r) => r.state === state).length;
  const inHouse = runs.filter((r) => r.delivery === "in_house").length;
  const external = runs.length - inHouse;
  const ratio = inHouse > 0 ? external / inHouse : null;
  const live = runs.filter((r) => r.state !== "blocked");
  const totalCost = round2(live.reduce((sum, r) => sum + r.plannedCost, 0));

  const months: CalendarMonth[] = MONTH_LABELS.map((label, index) => {
    const here = runs.filter((r) => r.month === index);
    const cost = (delivery: CalendarRow["delivery"]) =>
      round2(here.filter((r) => r.state !== "blocked" && r.delivery === delivery).reduce((s, r) => s + r.plannedCost, 0));
    return { label, index, runs: here.length, inHouseCost: cost("in_house"), externalCost: cost("external") };
  });

  const summary: CalendarSummary = {
    total: runs.length,
    completed: count("completed"),
    planned: count("planned"),
    standby: count("standby"),
    blocked: count("blocked"),
    inHouse,
    external,
    ratio,
    ratioText: ratio === null ? (external > 0 ? "no in-house runs" : "—") : `${ratio.toFixed(1)} : 1`,
    seatsExpected: live.reduce((sum, r) => sum + r.expectedPax, 0),
    seatsCapacity: live.reduce((sum, r) => sum + r.maxPax, 0),
    totalCost,
    toBudget: analysis.outlook.commitments.calendar,
    sharePct: config.budgetPhp > 0 ? Math.round((totalCost * 1000) / config.budgetPhp) / 10 : null,
    placed: runs.reduce((sum, r) => sum + r.planPeople, 0),
    unplaced: analysis.plan?.unplaced ?? 0,
  };

  const markers: CalendarMarker[] = [
    ...MILESTONE_POINTS.map(
      (p): CalendarMarker => ({ label: `${p.label} target`, date: `${config.year}-${p.monthDay}`, kind: "milestone" }),
    ),
    { label: "As of", date: config.asOfDate, kind: "as-of" },
    { label: "Last in-person day", date: cutoff, kind: "cutoff" },
    { label: "Online deadline", date: `${config.year}-12-31`, kind: "deadline" },
  ];

  const windows: CalendarWindow[] = (analysis.windows?.rows ?? []).map((w) => ({
    unit: w.unit,
    month: w.month,
    state: w.state,
    size: w.size,
  }));

  return {
    year: config.year,
    asOfDate: config.asOfDate,
    runs,
    summary,
    months,
    markers,
    windows,
    alerts: calendarAlerts(summary, months, config, outsideYear),
    targetRatio: TARGET_MIX,
  };
}

function calendarAlerts(
  s: CalendarSummary,
  months: readonly CalendarMonth[],
  config: RulesConfig,
  outsideYear: number,
): CalendarAlert[] {
  const alerts: CalendarAlert[] = [];
  if (s.blocked > 0) {
    alerts.push({
      tone: "warning",
      text: `${plural(s.blocked, "run is", "runs are")} dated after Dec 14 and cannot run in person. They are not budgeted.`,
    });
  }
  if (s.standby > 0) {
    alerts.push({
      tone: "info",
      text: `${plural(s.standby, "upcoming run is", "upcoming runs are")} not needed to close the gap (below the minimum, or costlier than the paid LinkedIn fee). They are still budgeted at expected enrolment.`,
    });
  }
  const asOfMonth = Number(config.asOfDate.slice(5, 7)) - 1;
  const empty = months.filter((m) => m.index > asOfMonth && m.index <= 10 && m.runs === 0).map((m) => m.label);
  if (s.total > 0 && empty.length > 0) {
    alerts.push({ tone: "info", text: `No run is scheduled in ${empty.join(", ")}.` });
  }
  const off =
    s.ratio === null
      ? s.total > 0
      : Math.abs(s.ratio - TARGET_MIX) > MIX_TOLERANCE;
  if (s.total > 0 && off) {
    alerts.push({
      tone: "warning",
      text: `The face-to-face mix is ${s.ratioText} (external to in-house); the company target is ${TARGET_MIX} : 1.`,
    });
  }
  if (s.unplaced > 0) {
    alerts.push({
      tone: "warning",
      text: `${plural(s.unplaced, "unlicensed person has", "unlicensed people have")} no run and no paid LinkedIn course, so the plan cannot close them by the deadline.`,
    });
  }
  if (outsideYear > 0) {
    alerts.push({
      tone: "warning",
      text: `${plural(outsideYear, "run is", "runs are")} dated outside ${config.year} and left out of this view.`,
    });
  }
  return alerts;
}

const CSV_HEADER = [
  "run_id",
  "course_id",
  "run_title",
  "date",
  "delivery",
  "hours",
  "speakers",
  "cost_per_run",
  "cost_per_head",
  "min_pax",
  "max_pax",
  "expected_pax",
  "planned_cost",
  "state",
  "plan_people",
  "reason",
] as const;

/** UTF-8 CSV (BOM, CRLF) of the effective calendar with its planned cost and state (spec §4.10). */
export function buildCalendarCsv(view: CalendarView): string {
  const lines = view.runs.map((r) =>
    [
      r.runId,
      r.courseId,
      r.title,
      r.date,
      r.delivery,
      String(r.hours),
      String(r.speakers),
      String(r.perRun),
      String(r.perHead),
      String(r.minPax),
      String(r.maxPax),
      String(r.expectedPax),
      String(r.plannedCost),
      r.state,
      String(r.planPeople),
      r.reason ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [CSV_HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}

export const calendarFileName = (year: number): string => `training-calendar-${year}.csv`;
