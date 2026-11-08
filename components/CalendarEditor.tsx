import { useState } from "react";
import {
  formatPeso,
  resolveRun,
  runCost,
  validateDraft,
  type DraftContext,
  type DraftField,
  type RunDraft,
} from "@/lib/analysis";
import type { CalendarRow } from "@/lib/schemas";
import { Banner, Field, buttonClass, inputClass } from "./ui";

const LABELS: Record<DraftField, string> = {
  run_id: "Run ID",
  course_id: "Course ID",
  run_title: "Run title",
  date: "Date",
  delivery: "Delivery",
  hours: "Hours",
  speakers: "Speakers",
  cost_per_run: "Fixed cost per run",
  cost_per_head: "Cost per person",
  min_pax: "Minimum seats",
  max_pax: "Maximum seats",
  expected_pax: "Expected seats",
};

/** Spec §4.11: add or edit one run. Errors block saving; warnings do not. */
export function CalendarEditor({
  heading,
  initial,
  context,
  lockId,
  onSave,
  onCancel,
}: {
  heading: string;
  initial: RunDraft;
  context: DraftContext;
  /** The id of an existing run cannot change. */
  lockId: boolean;
  onSave: (row: CalendarRow) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<RunDraft>(initial);
  const [tried, setTried] = useState(false);
  const result = validateDraft(draft, context);
  const inHouse = draft.delivery === "in_house";

  const set = (field: DraftField) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const error = (field: DraftField) => (tried && result.errors[field] ? `${LABELS[field]} ${result.errors[field]}` : undefined);

  const text = (field: DraftField, props: { hint?: string; disabled?: boolean; type?: string; numeric?: boolean } = {}) => (
    <Field label={LABELS[field]} htmlFor={`run-${field}`} hint={props.hint} error={error(field)}>
      <input
        id={`run-${field}`}
        type={props.type ?? "text"}
        inputMode={props.numeric ? "numeric" : undefined}
        value={draft[field]}
        disabled={props.disabled}
        aria-invalid={error(field) ? true : undefined}
        aria-describedby={error(field) ? `run-${field}-error` : props.hint ? `run-${field}-hint` : undefined}
        onChange={(e) => set(field)(e.target.value)}
        className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`}
      />
    </Field>
  );

  const preview = result.row
    ? (() => {
        const resolved = resolveRun(result.row);
        return `At ${resolved.expectedPax} expected people the run costs ${formatPeso(runCost(resolved, resolved.expectedPax))}; ${formatPeso(
          Math.round((resolved.perRun / result.row.max_pax + resolved.perHead) * 100) / 100,
        )} per person when full.`;
      })()
    : null;

  return (
    <form
      aria-label={heading}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (result.row) onSave(result.row);
        else setTried(true);
      }}
      className="space-y-3 rounded-lg border border-indigo-300 bg-white p-4"
    >
      <h4 className="font-semibold text-slate-900">{heading}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {text("run_title")}
        {text("run_id", { disabled: lockId, hint: lockId ? "Cannot change for an existing run" : undefined })}
        {text("course_id")}
        <Field label={LABELS.delivery} htmlFor="run-delivery" error={error("delivery")}>
          <select
            id="run-delivery"
            value={draft.delivery}
            onChange={(e) => set("delivery")(e.target.value)}
            className={inputClass}
          >
            <option value="in_house">In-house</option>
            <option value="external">External</option>
          </select>
        </Field>
        {text("date", { type: "date" })}
        {inHouse && text("hours", { numeric: true, hint: "1 to 24" })}
        {inHouse && text("speakers", { numeric: true, hint: "₱500 each for every 2 hours" })}
        {text("cost_per_run", {
          numeric: true,
          hint: inHouse ? "Blank = honoraria from speakers and hours" : "Usually blank",
        })}
        {text("cost_per_head", {
          numeric: true,
          hint: inHouse ? "Blank = snacks: ₱75 (4 hours) or ₱150 (full day)" : "Required: the fee for one person",
        })}
        {text("min_pax", { numeric: true })}
        {text("max_pax", { numeric: true })}
        {text("expected_pax", { numeric: true, hint: "Blank = maximum seats" })}
      </div>
      {result.warnings.map((w) => (
        <Banner key={w} tone="warning">
          {w}
        </Banner>
      ))}
      {tried && !result.row && <Banner tone="error">Fix the highlighted fields to save this run.</Banner>}
      {preview && <p className="text-sm text-slate-600">{preview}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass("primary")}>
          Save run
        </button>
        <button type="button" onClick={onCancel} className={buttonClass("secondary")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
