import { useState, type ReactNode } from "react";
import {
  MONTH_LABELS,
  QUARTERS,
  defaultQuarter,
  formatPeso,
  isAvailable,
  quarterCounts,
  quarterMonths,
  quarterOfMonth,
  quarterSummary,
  seatsOpen,
  windowsInQuarter,
  type CalendarRun,
  type CalendarView,
  type Quarter,
} from "@/lib/analysis";
import { DELIVERY_TEXT, STATE_BADGE, STATE_TEXT } from "./CalendarGrid";

const fmt = (n: number) => n.toLocaleString("en-PH");

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold text-slate-900">{value}</dd>
      <dd className="text-xs text-slate-500">{sub}</dd>
    </div>
  );
}

function priceText(r: CalendarRun): string {
  return r.perRun > 0
    ? `${formatPeso(r.perRun)} per run + ${formatPeso(r.perHead)} per person`
    : `${formatPeso(r.perHead)} per person`;
}

/** Spec §4.10: what can still be signed up for in a quarter, with estimated seats open. */
export function CalendarQuarter({
  view,
  runs,
  selectedId,
  onSelect,
}: {
  view: CalendarView;
  /** Runs after the delivery and state filters. */
  runs: readonly CalendarRun[];
  selectedId: string | null;
  onSelect: (runId: string) => void;
}) {
  const [picked, setPicked] = useState<Quarter | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const quarter = picked ?? defaultQuarter(view.runs, view.asOfDate);

  const pool = onlyAvailable ? runs.filter(isAvailable) : runs;
  const counts = quarterCounts(pool);
  const list = pool
    .filter((r) => quarterOfMonth(r.month) === quarter)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.runId < b.runId ? -1 : 1));
  const summary = quarterSummary(list, quarter);
  const windows = windowsInQuarter(view.windows, quarter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div role="group" aria-label="Quarter" className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {QUARTERS.map((q) => {
            const c = counts.find((x) => x.quarter === q);
            return (
              <button
                key={q}
                type="button"
                aria-pressed={q === quarter}
                onClick={() => setPicked(q)}
                className={`border-r border-slate-300 px-3.5 py-2 text-sm font-medium last:border-r-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 ${
                  q === quarter ? "bg-indigo-600 text-white" : "bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                Q{q}
                <span className="ml-1.5 text-xs font-normal opacity-80">
                  {c?.total ?? 0} {onlyAvailable ? "open" : "runs"}
                </span>
              </button>
            );
          })}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Only trainings still available
        </label>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label={`Runs in Q${quarter}`} value={fmt(summary.runs)} sub={`${summary.external} external · ${summary.inHouse} in-house`} />
        <Tile label="Seats open (estimate)" value={fmt(summary.seatsOpen)} sub="maximum minus expected enrolment" />
        <Tile label="Cost at expected enrolment" value={formatPeso(summary.cost)} sub="runs shown, not after Dec 14" />
      </dl>

      {windows.length > 0 && (
        <p className="rounded-lg border border-dashed border-indigo-400 bg-indigo-50 px-3 py-2 text-sm text-slate-800">
          <span className="font-semibold">Recommended course windows this quarter:</span>{" "}
          {windows.map((w) => `${w.unit} in ${MONTH_LABELS[w.month - 1]}`).join(" · ")}. Staff of those sectors take it on LinkedIn in their month.
        </p>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">
          <p className="font-semibold text-slate-800">
            {onlyAvailable ? `Nothing left to sign up for in Q${quarter}.` : `No runs in Q${quarter} match the filters.`}
          </p>
          {onlyAvailable && <p>Every run in this quarter has already been held or is after Dec 14. Untick the filter to see them.</p>}
        </div>
      ) : (
        quarterMonths(quarter).map((m) => {
          const inMonth = list.filter((r) => r.month === m);
          if (inMonth.length === 0) return null;
          return (
            <section key={m} aria-label={`${MONTH_LABELS[m]} ${view.year}`} className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                {MONTH_LABELS[m]} {view.year}{" "}
                <span className="font-normal normal-case tracking-normal text-slate-500">
                  {inMonth.length} {inMonth.length === 1 ? "run" : "runs"}
                </span>
              </h4>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {inMonth.map((r) => {
                  const fill = Math.round((r.expectedPax * 100) / r.maxPax);
                  return (
                    <li key={r.runId} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={selectedId === r.runId}
                        onClick={() => onSelect(r.runId)}
                        className={`block h-full w-full rounded-lg border border-l-4 p-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600 ${
                          r.delivery === "external" ? "border-l-amber-500" : "border-l-indigo-500"
                        } ${selectedId === r.runId ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"} ${r.state === "completed" ? "opacity-75" : ""}`}
                      >
                        <span className="flex items-start gap-3">
                          <span className="w-8 shrink-0 text-right text-xl font-bold leading-none tabular-nums text-slate-900">
                            {Number(r.date.slice(8, 10))}
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{MONTH_LABELS[m]}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-slate-900 [overflow-wrap:anywhere]">{r.title}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                              <span>{r.delivery === "in_house" ? `${DELIVERY_TEXT.in_house} · ${r.hours}h` : DELIVERY_TEXT.external}</span>
                              <span className={`rounded px-1.5 font-medium ${STATE_BADGE[r.state]}`}>{STATE_TEXT[r.state]}</span>
                            </span>
                          </span>
                        </span>
                        <span
                          role="img"
                          aria-label={`${fill} percent of seats expected to be taken`}
                          className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200"
                        >
                          <span className="block h-full bg-emerald-600" style={{ width: `${Math.min(100, fill)}%` }} />
                        </span>
                        <span className="mt-1.5 block text-xs text-slate-600">
                          {isAvailable(r) ? `${fmt(seatsOpen(r))} seats open` : STATE_TEXT[r.state]} of {fmt(r.maxPax)} · minimum {fmt(r.minPax)}
                        </span>
                        <span className="block text-xs text-slate-600">{priceText(r)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
