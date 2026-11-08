import { MONTH_LABELS, formatPeso, type CalendarRun, type CalendarView, type RunState } from "@/lib/analysis";

export const STATE_TEXT: Record<RunState, string> = {
  completed: "Held",
  planned: "Planned",
  standby: "Not needed",
  blocked: "After Dec 14",
};
export const STATE_BADGE: Record<RunState, string> = {
  completed: "bg-slate-100 text-slate-700",
  planned: "bg-emerald-50 text-emerald-800",
  standby: "bg-amber-50 text-amber-800",
  blocked: "bg-red-50 text-red-800",
};
export const DELIVERY_TEXT = { in_house: "In-house", external: "External" } as const;

const fmt = (n: number) => n.toLocaleString("en-PH");

/** Day of month from `YYYY-MM-DD`, without a leading zero. */
const day = (date: string): number => Number(date.slice(8, 10));

function markerText(label: string, kind: string, date: string): string {
  if (kind === "milestone") return label;
  return `${label}: ${MONTH_LABELS[Number(date.slice(5, 7)) - 1]} ${day(date)}`;
}

export function CalendarGrid({
  view,
  runs,
  selectedId,
  onSelect,
}: {
  view: CalendarView;
  /** Runs after the filters; the month cards show only these. */
  runs: readonly CalendarRun[];
  selectedId: string | null;
  onSelect: (runId: string) => void;
}) {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`Training calendar ${view.year} by month`}>
      {view.months.map((m) => {
        const here = runs.filter((r) => r.month === m.index);
        const marks = view.markers.filter((k) => Number(k.date.slice(5, 7)) - 1 === m.index);
        const asOfMonth = Number(view.asOfDate.slice(5, 7)) - 1;
        return (
          <li
            key={m.label}
            aria-current={m.index === asOfMonth ? "date" : undefined}
            className={`min-w-0 rounded-lg border p-3 ${m.index === asOfMonth ? "border-indigo-400 bg-indigo-50/40" : "border-slate-200 bg-white"}`}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <h4 className="font-semibold text-slate-900">{m.label}</h4>
              <span className="text-xs text-slate-500">
                {here.length} {here.length === 1 ? "run" : "runs"}
                {m.inHouseCost + m.externalCost > 0 && ` · ${formatPeso(m.inHouseCost + m.externalCost)}`}
              </span>
            </div>
            {marks.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1">
                {marks.map((k) => (
                  <li
                    key={k.label}
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      k.kind === "cutoff"
                        ? "bg-red-50 text-red-800"
                        : k.kind === "milestone"
                          ? "bg-indigo-50 text-indigo-800"
                          : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {markerText(k.label, k.kind, k.date)}
                  </li>
                ))}
              </ul>
            )}
            {here.length === 0 ? (
              <p className="text-sm text-slate-400">No runs</p>
            ) : (
              <ul className="space-y-1.5">
                {here.map((r) => (
                  <li key={r.runId}>
                    <button
                      type="button"
                      aria-pressed={selectedId === r.runId}
                      onClick={() => onSelect(r.runId)}
                      className={`block w-full rounded-md border-l-4 border-y border-r px-2 py-1.5 text-left text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600 ${
                        r.delivery === "external" ? "border-l-amber-500" : "border-l-indigo-500"
                      } ${selectedId === r.runId ? "border-y-indigo-500 border-r-indigo-500 bg-indigo-50" : "border-y-slate-200 border-r-slate-200 bg-white"} ${
                        r.state === "completed" ? "text-slate-500" : "text-slate-900"
                      }`}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="w-5 shrink-0 text-right font-semibold tabular-nums">{day(r.date)}</span>
                        <span className={`min-w-0 flex-1 truncate ${r.state === "blocked" ? "line-through" : ""}`}>{r.title}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-7 text-xs text-slate-500">
                        <span>{DELIVERY_TEXT[r.delivery]}</span>
                        <span>{fmt(r.expectedPax)} of {fmt(r.maxPax)} seats</span>
                        <span className={`rounded px-1 ${STATE_BADGE[r.state]}`}>{STATE_TEXT[r.state]}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
