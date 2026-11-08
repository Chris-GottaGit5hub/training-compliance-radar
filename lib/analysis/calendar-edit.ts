import { calendarRowSchema, type CalendarRow } from "@/lib/schemas/rows";
import { applyCalendarEdits, type CalendarEdit } from "./calendar-view";

/** The text of every field in the run form (spec §4.11). Blank optional cells are allowed. */
export interface RunDraft {
  run_id: string;
  course_id: string;
  run_title: string;
  date: string;
  delivery: string;
  hours: string;
  speakers: string;
  cost_per_run: string;
  cost_per_head: string;
  min_pax: string;
  max_pax: string;
  expected_pax: string;
}
export type DraftField = keyof RunDraft;

export const DRAFT_FIELDS: readonly DraftField[] = [
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
];

const text = (n: number | undefined): string => (n === undefined ? "" : String(n));

export function draftFromRow(row: CalendarRow): RunDraft {
  return {
    run_id: row.run_id,
    course_id: row.course_id,
    run_title: row.run_title ?? "",
    date: row.date,
    delivery: row.delivery,
    hours: text(row.hours),
    speakers: text(row.speakers),
    cost_per_run: text(row.cost_per_run),
    cost_per_head: text(row.cost_per_head),
    min_pax: text(row.min_pax),
    max_pax: text(row.max_pax),
    expected_pax: text(row.expected_pax),
  };
}

/** The smallest unused `NEW-n` id. */
export function newRunId(existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  let n = 1;
  while (taken.has(`NEW-${n}`)) n++;
  return `NEW-${n}`;
}

/** An empty form for a new run. */
export function blankDraft(existingIds: Iterable<string>, delivery: "in_house" | "external" = "in_house"): RunDraft {
  return {
    run_id: newRunId(existingIds),
    course_id: delivery === "external" ? "EXTERNAL" : "",
    run_title: "",
    date: "",
    delivery,
    hours: delivery === "in_house" ? "8" : "",
    speakers: delivery === "in_house" ? "1" : "",
    cost_per_run: "",
    cost_per_head: "",
    min_pax: delivery === "in_house" ? "10" : "1",
    max_pax: "",
    expected_pax: "",
  };
}

/** A copy of a run under a new id, for the form. */
export function duplicateDraft(row: CalendarRow, existingIds: Iterable<string>): RunDraft {
  return { ...draftFromRow(row), run_id: newRunId(existingIds) };
}

export interface DraftContext {
  year: number;
  asOfDate: string;
  /** Run ids used by other runs (not the run being edited). */
  takenIds: ReadonlySet<string>;
}

export interface DraftResult {
  /** The valid row, or null when there are errors. */
  row: CalendarRow | null;
  errors: Partial<Record<DraftField, string>>;
  /** Notes that never block saving. */
  warnings: string[];
}

/** Spec §4.11: errors block saving, warnings do not. */
export function validateDraft(draft: RunDraft, ctx: DraftContext): DraftResult {
  const input: Record<string, string | undefined> = {};
  for (const field of DRAFT_FIELDS) {
    const value = draft[field].trim();
    input[field] = value === "" ? undefined : value;
  }
  const parsed = calendarRowSchema.safeParse(input);
  const errors: Partial<Record<DraftField, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && (DRAFT_FIELDS as readonly string[]).includes(field) && !errors[field as DraftField]) {
        errors[field as DraftField] = issue.message;
      }
    }
  }
  const id = draft.run_id.trim();
  if (id !== "" && ctx.takenIds.has(id)) errors.run_id = "is already used by another run";
  const date = draft.date.trim();
  if (date !== "" && !errors.date && !date.startsWith(`${ctx.year}-`)) errors.date = `must be in ${ctx.year}`;

  const warnings: string[] = [];
  if (date !== "" && !errors.date) {
    if (date <= ctx.asOfDate) warnings.push("This date is on or before the as-of date, so the run counts as already held.");
    else if (date > `${ctx.year}-12-14`) warnings.push("This date is after Dec 14. It cannot run in person and is not budgeted.");
  }
  const ok = parsed.success && Object.keys(errors).length === 0;
  return { row: ok ? parsed.data : null, errors, warnings };
}

/** Drops the last change. */
export const undoEdit = (edits: readonly CalendarEdit[]): CalendarEdit[] => edits.slice(0, -1);

const editRunId = (edit: CalendarEdit): string => (edit.type === "remove" ? edit.runId : edit.row.run_id);

/** Drops every change to one run, returning it to the uploaded calendar (or to nothing, if it was added). */
export const restoreRun = (edits: readonly CalendarEdit[], runId: string): CalendarEdit[] =>
  edits.filter((e) => editRunId(e) !== runId);

/** Uploaded runs that the changes have removed. */
export function removedRuns(base: readonly CalendarRow[], edits: readonly CalendarEdit[]): CalendarRow[] {
  const kept = new Set(applyCalendarEdits(base, edits).map((r) => r.run_id));
  return base.filter((r) => !kept.has(r.run_id));
}

/** Runs now in the calendar that were added or changed. */
export function editedRunIds(base: readonly CalendarRow[], edits: readonly CalendarEdit[]): Set<string> {
  const now = new Set(applyCalendarEdits(base, edits).map((r) => r.run_id));
  return new Set(edits.map(editRunId).filter((id) => now.has(id)));
}

/** How many different runs the changes touch. */
export const changedRunCount = (edits: readonly CalendarEdit[]): number => new Set(edits.map(editRunId)).size;

/** One plain line per change, newest first. */
export function describeEdits(base: readonly CalendarRow[], edits: readonly CalendarEdit[]): string[] {
  const known = new Map(base.map((r) => [r.run_id, r]));
  const lines: string[] = [];
  for (const edit of edits) {
    const id = editRunId(edit);
    const before = known.get(id);
    if (edit.type === "remove") {
      lines.push(`Removed ${before?.run_title ?? before?.course_id ?? id} (${before?.date ?? "no date"})`);
      known.delete(id);
    } else {
      const title = edit.row.run_title ?? edit.row.course_id;
      lines.push(`${before ? "Changed" : "Added"} ${title} (${edit.row.date})`);
      known.set(id, edit.row);
    }
  }
  return lines.reverse();
}
