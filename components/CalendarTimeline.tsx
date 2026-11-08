import { useMemo } from "react";
import {
  MONTH_LABELS,
  cellState,
  courseTimeline,
  runsInMonth,
  type CalendarRun,
  type CalendarView,
  type RunState,
} from "@/lib/analysis";
import { DELIVERY_TEXT, STATE_TEXT } from "./CalendarGrid";

const HATCH = {
  indigo: "repeating-linear-gradient(45deg, #e0e7ff 0 5px, transparent 5px 10px)",
  amber: "repeating-linear-gradient(45deg, #fef3c7 0 5px, transparent 5px 10px)",
  red: "repeating-linear-gradient(45deg, #fee2e2 0 5px, transparent 5px 10px)",
} as const;

function cellStyle(delivery: CalendarRun["delivery"], state: RunState): { className: string; hatch?: string } {
  const inHouse = delivery === "in_house";
  switch (state) {
    case "planned":
      return { className: inHouse ? "bg-indigo-600 text-white" : "bg-amber-500 text-slate-900" };
    case "standby":
      return inHouse
        ? { className: "border-indigo-500 text-indigo-700", hatch: HATCH.indigo }
        : { className: "border-amber-500 text-amber-800", hatch: HATCH.amber };
    case "completed":
      return { className: "bg-slate-300 text-slate-700" };
    case "blocked":
      return { className: "border-red-500 text-red-700", hatch: HATCH.red };
  }
}

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Spec §4.10: courses down the left, January to December across, a month shaded where a run falls. */
export function CalendarTimeline({
  view,
  runs,
  selectedIds,
  onSelect,
}: {
  view: CalendarView;
  /** Runs after the filters. */
  runs: readonly CalendarRun[];
  selectedIds: readonly string[];
  onSelect: (runIds: string[]) => void;
}) {
  const rows = useMemo(() => courseTimeline(runs), [runs]);
  const groups = [
    { delivery: "external" as const, rows: rows.filter((r) => r.delivery === "external") },
    { delivery: "in_house" as const, rows: rows.filter((r) => r.delivery === "in_house") },
  ].filter((g) => g.rows.length > 0);

  const asOfInYear = view.asOfDate.startsWith(`${view.year}-`);
  const asOfMonth = Number(view.asOfDate.slice(5, 7)) - 1;
  const asOfPct = ((asOfMonth + Number(view.asOfDate.slice(8, 10)) / daysIn(view.year, asOfMonth)) / 12) * 100;
  const cutoffPct = ((11 + 14 / 31) / 12) * 100;

  if (rows.length === 0) {
    return <p className="rounded-lg border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">No runs match the filters.</p>;
  }

  return (
    <div className="relative overflow-x-auto rounded-lg border border-slate-200">
      <div className="relative min-w-[860px]">
        <div className="grid grid-cols-[14rem_1fr] border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
          <div className="sticky left-0 z-20 flex items-end border-r border-slate-200 bg-slate-50 px-3 py-2">Course</div>
          <div>
            <div className="grid grid-cols-4">
              {[1, 2, 3, 4].map((q) => (
                <div key={q} className="border-l border-slate-200 bg-indigo-50 py-1 text-center font-bold text-indigo-700 first:border-l-0">
                  Q{q}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-12">
              {MONTH_LABELS.map((m) => (
                <div key={m} className="border-l border-slate-200 py-1 text-center first:border-l-0">
                  {m}
                </div>
              ))}
            </div>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.delivery}>
            <div className="sticky left-0 border-b border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              {DELIVERY_TEXT[g.delivery]} · {g.rows.length} {g.rows.length === 1 ? "course" : "courses"}
            </div>
            {g.rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[14rem_1fr] border-b border-slate-100 last:border-b-0">
                <div className="sticky left-0 z-20 min-w-0 border-r border-slate-200 bg-white px-3 py-2">
                  <div className="font-medium text-slate-900 [overflow-wrap:anywhere]">{row.title}</div>
                  <div className="text-xs text-slate-500">
                    {row.runs.length} {row.runs.length === 1 ? "run" : "runs"}
                  </div>
                </div>
                <div className="grid grid-cols-12">
                  {MONTH_LABELS.map((m, i) => {
                    const here = runsInMonth(row, i);
                    if (here.length === 0) return <div key={m} className="min-h-12 border-l border-slate-100 first:border-l-0" />;
                    const state = cellState(here);
                    const style = cellStyle(row.delivery, state);
                    const ids = here.map((r) => r.runId);
                    const days = here.map((r) => Number(r.date.slice(8, 10))).join(" · ");
                    const on = sameIds(selectedIds, ids);
                    return (
                      <div key={m} className="flex min-h-12 border-l border-slate-100 p-1 first:border-l-0">
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`${row.title}, ${m} ${days}, ${STATE_TEXT[state]}`}
                          onClick={() => onSelect(ids)}
                          style={style.hatch ? { backgroundImage: style.hatch } : undefined}
                          className={`flex min-w-0 flex-1 items-center justify-center rounded border border-transparent px-0.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600 ${style.className} ${on ? "ring-2 ring-slate-900" : ""}`}
                        >
                          {days}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-56 right-0 z-10">
          {asOfInYear && (
            <div className="absolute inset-y-0 border-l-2 border-indigo-600" style={{ left: `${asOfPct}%` }}>
              <span className="absolute right-1 top-0.5 whitespace-nowrap rounded bg-white px-1 text-[10px] font-bold text-indigo-700">
                As of {view.asOfDate.slice(5)}
              </span>
            </div>
          )}
          <div
            className="absolute inset-y-0 right-0 border-l border-dashed border-red-500"
            style={{ left: `${cutoffPct}%`, backgroundImage: "repeating-linear-gradient(45deg, transparent 0 6px, rgba(254,226,226,.9) 6px 7px)" }}
          />
        </div>
      </div>
    </div>
  );
}

export function TimelineLegend() {
  const item = (swatch: string, style: object | undefined, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <i aria-hidden="true" className={`inline-block h-3 w-[18px] rounded-sm ${swatch}`} style={style} />
      {text}
    </span>
  );
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
      {item("bg-indigo-600", undefined, "In-house, planned")}
      {item("bg-amber-500", undefined, "External, planned")}
      {item("border border-indigo-500", { backgroundImage: HATCH.indigo }, "Not needed by the plan")}
      {item("bg-slate-300", undefined, "Already held")}
      {item("border border-red-500", { backgroundImage: HATCH.red }, "After Dec 14")}
    </p>
  );
}
