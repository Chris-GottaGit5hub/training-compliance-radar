"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  MONTH_LABELS,
  buildCalendarCsv,
  buildCalendarView,
  calendarFileName,
  formatPeso,
  formatPesoCompact,
  type CalendarRun,
  type CalendarView,
  type RunState,
} from "@/lib/analysis";
import { AMBER, ChartPanel, INDIGO } from "./ChartPanel";
import { CalendarGrid, DELIVERY_TEXT, STATE_BADGE, STATE_TEXT } from "./CalendarGrid";
import { downloadTextFile } from "./download";
import type { useRadarState } from "./useRadarState";
import { Banner, Card, buttonClass, inputClass } from "./ui";

type RadarState = ReturnType<typeof useRadarState>;

const fmt = (n: number) => n.toLocaleString("en-PH");
const peso = (value: unknown): string => (typeof value === "number" ? formatPeso(value) : "");

function Tile({ label, value, sub, warn }: { label: string; value: ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold ${warn ? "text-red-700" : "text-slate-900"}`}>{value}</dd>
      {sub && <dd className="text-xs text-slate-500">{sub}</dd>}
    </div>
  );
}

function Summary({ view }: { view: CalendarView }) {
  const s = view.summary;
  const mixOff = view.alerts.some((a) => a.text.includes("face-to-face mix"));
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Tile
        label="Runs in the year"
        value={fmt(s.total)}
        sub={`${s.completed} held · ${s.planned} planned · ${s.standby} not needed${s.blocked > 0 ? ` · ${s.blocked} after Dec 14` : ""}`}
      />
      <Tile
        label="External : in-house"
        value={s.ratioText}
        sub={`${s.external} external, ${s.inHouse} in-house (target ${view.targetRatio} : 1)`}
        warn={mixOff}
      />
      <Tile
        label="Seats expected"
        value={fmt(s.seatsExpected)}
        sub={`of ${fmt(s.seatsCapacity)} capacity${s.seatsCapacity > 0 ? ` (${Math.round((s.seatsExpected * 100) / s.seatsCapacity)}%)` : ""}`}
      />
      <Tile
        label="Calendar cost"
        value={formatPeso(s.totalCost)}
        sub={s.sharePct === null ? "at expected enrolment" : `${s.sharePct}% of the allocation`}
      />
      <Tile label="Still to budget" value={formatPeso(s.toBudget)} sub="runs after the as-of date" />
      <Tile
        label="People the plan places"
        value={fmt(s.placed)}
        sub={s.unplaced > 0 ? `${fmt(s.unplaced)} cannot be placed` : "everyone at risk is covered"}
        warn={s.unplaced > 0}
      />
    </dl>
  );
}

function RunDetail({ run, onClose }: { run: CalendarRun; onClose: () => void }) {
  const row = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
  const inHouse = run.delivery === "in_house";
  return (
    <section aria-label={`Details of ${run.title}`} className="rounded-lg border border-indigo-300 bg-indigo-50/30 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-slate-900">{run.title}</h4>
          <p className="text-sm text-slate-600">
            {run.date} · {DELIVERY_TEXT[run.delivery]} · {run.runId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATE_BADGE[run.state]}`}>{STATE_TEXT[run.state]}</span>
          <button type="button" onClick={onClose} className={buttonClass("secondary")}>
            Close
          </button>
        </div>
      </div>
      {run.reason && (
        <p className="mb-3 text-sm text-slate-700">
          {run.state === "standby" ? "The plan does not need this run: " : "Cannot run: "}
          {run.reason}.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {row("Seats", `${fmt(run.minPax)} minimum · ${fmt(run.expectedPax)} expected · ${fmt(run.maxPax)} maximum`)}
        {inHouse && row("Length and speakers", `${run.hours} hours · ${run.speakers} ${run.speakers === 1 ? "speaker" : "speakers"}`)}
        {row(inHouse ? "Honoraria (fixed)" : "Fixed cost", formatPeso(run.perRun))}
        {row(inHouse ? "Snacks per person" : "Fee per person", formatPeso(run.perHead))}
        {row("Cost at expected enrolment", formatPeso(run.plannedCost))}
        {row("Cost per person when full", formatPeso(run.fullPerHead))}
        {row("People the plan places", run.state === "planned" ? fmt(run.planPeople) : "—")}
        {row("Course", run.courseId)}
      </dl>
    </section>
  );
}

function RunTable({
  runs,
  selectedId,
  onSelect,
}: {
  runs: readonly CalendarRun[];
  selectedId: string | null;
  onSelect: (runId: string) => void;
}) {
  const head = "px-3 py-2 font-medium";
  return (
    <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <caption className="sr-only">Training runs for the year</caption>
        <thead className="sticky top-0 bg-slate-50 text-slate-600">
          <tr>
            <th scope="col" className={`${head} text-left`}>Date</th>
            <th scope="col" className={`${head} text-left`}>Run</th>
            <th scope="col" className={`${head} text-left`}>Delivery</th>
            <th scope="col" className={`${head} text-right`}>Seats (min–max)</th>
            <th scope="col" className={`${head} text-right`}>Expected</th>
            <th scope="col" className={`${head} text-right`}>Cost</th>
            <th scope="col" className={`${head} text-left`}>State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((r) => (
            <tr key={r.runId} className={selectedId === r.runId ? "bg-indigo-50" : ""}>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.date}</td>
              <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                <button
                  type="button"
                  aria-pressed={selectedId === r.runId}
                  onClick={() => onSelect(r.runId)}
                  className="text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600"
                >
                  {r.title}
                </button>
              </th>
              <td className="px-3 py-2">{DELIVERY_TEXT[r.delivery]}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(r.minPax)}–{fmt(r.maxPax)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(r.expectedPax)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.state === "blocked" ? "—" : formatPeso(r.plannedCost)}</td>
              <td className="px-3 py-2">
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATE_BADGE[r.state]}`}>{STATE_TEXT[r.state]}</span>
              </td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                No runs match the filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CostChart({ view }: { view: CalendarView }) {
  const data = view.months.map((m) => ({ label: m.label, "In-house": m.inHouseCost, External: m.externalCost }));
  const busiest = [...view.months].sort((a, b) => b.inHouseCost + b.externalCost - (a.inHouseCost + a.externalCost))[0];
  return (
    <ChartPanel
      title="Calendar cost by month"
      description="Cost of each month's runs at expected enrolment, in-house and external."
      summary={`Total ${formatPeso(view.summary.totalCost)}; the most expensive month is ${busiest?.label ?? "none"}.`}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatPesoCompact} tick={{ fontSize: 12 }} width={64} />
          <Tooltip formatter={peso} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="In-house" stackId="cost" fill={INDIGO} />
          <Bar dataKey="External" stackId="cost" fill={AMBER} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}

const WINDOW_CELL = { upcoming: "bg-indigo-200", open: "bg-indigo-600", closed: "bg-slate-300" } as const;
const WINDOW_TEXT = { upcoming: "upcoming", open: "open now", closed: "closed" } as const;

function WindowLane({ view, course }: { view: CalendarView; course: string }) {
  return (
    <div>
      <h4 className="font-semibold text-slate-900">Recommended course windows</h4>
      <p className="mb-2 text-sm text-slate-600">
        <span className="font-medium">{course}</span> runs once a year, one month per unit.
      </p>
      <div className="relative overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <caption className="sr-only">The month of the recommended course window for each unit</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Unit</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} scope="col" className="px-1 py-2 text-center font-medium">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.windows.map((w) => (
              <tr key={w.unit}>
                <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-slate-900">
                  {w.unit} <span className="font-normal text-slate-500">({fmt(w.size)})</span>
                </th>
                {MONTH_LABELS.map((m, i) => (
                  <td key={m} className="px-1 py-1.5 text-center">
                    {w.month === i + 1 ? (
                      <span className={`mx-auto block h-4 w-full min-w-6 rounded ${WINDOW_CELL[w.state]}`}>
                        <span className="sr-only">{WINDOW_TEXT[w.state]}</span>
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-slate-500">Light: upcoming. Dark: open now. Grey: closed.</p>
    </div>
  );
}

const STATES: RunState[] = ["completed", "planned", "standby", "blocked"];

export function CalendarTab({ state, onGoToData }: { state: RadarState; onGoToData: () => void }) {
  const { analysis, config, calendar, ready, sample, loadSample } = state;
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [delivery, setDelivery] = useState<"all" | "in_house" | "external">("all");
  const [runState, setRunState] = useState<"all" | RunState>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const view = useMemo(
    () =>
      analysis && config && calendar && calendar.length > 0 ? buildCalendarView(calendar, analysis, config) : null,
    [analysis, config, calendar],
  );
  const shown = useMemo(
    () =>
      (view?.runs ?? []).filter(
        (r) => (delivery === "all" || r.delivery === delivery) && (runState === "all" || r.state === runState),
      ),
    [view, delivery, runState],
  );
  const selected = view?.runs.find((r) => r.runId === selectedId) ?? null;

  const intro = (
    <div>
      <h2 id="calendar-title" className="text-lg font-semibold text-slate-900">Training calendar</h2>
      <p className="text-sm text-slate-600">
        Every planned in-house and external run for the year, what it costs, and whether the plan needs it.
        This view is read-only: change the calendar file and upload it again.
      </p>
    </div>
  );

  if (!view || !config) {
    const reason = !ready
      ? "Load your data first, or try the sample."
      : !analysis
        ? "Fix the highlighted rules on the Radar tab to see results."
        : "No training calendar is loaded. The calendar file is optional; without it the app estimates costs from the catalog.";
    return (
      <Card>
        <section aria-labelledby="calendar-title">
          <div className="mb-4">{intro}</div>
          <Banner tone="info">{reason}</Banner>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onGoToData} className={buttonClass("secondary")}>
              Go to Data
            </button>
            <button
              type="button"
              onClick={loadSample}
              disabled={sample.state === "loading"}
              className={buttonClass("primary")}
            >
              {sample.state === "loading" ? "Loading…" : "Load sample data"}
            </button>
          </div>
          {sample.state === "error" && (
            <div className="mt-2">
              <Banner tone="error">{sample.message}</Banner>
            </div>
          )}
          {ready && <p className="mt-2 text-xs text-slate-500">Loading the sample replaces the files you have loaded.</p>}
        </section>
      </Card>
    );
  }

  const exportCsv = () => downloadTextFile(calendarFileName(view.year), buildCalendarCsv(view));
  const select = (runId: string) => setSelectedId((cur) => (cur === runId ? null : runId));

  return (
    <Card>
      <section aria-labelledby="calendar-title" className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {intro}
          <div className="flex gap-2 print:hidden">
            <button type="button" onClick={exportCsv} className={buttonClass("secondary")}>
              Export calendar CSV
            </button>
            <button type="button" onClick={() => window.print()} className={buttonClass("secondary")}>
              Print
            </button>
          </div>
        </div>

        <Summary view={view} />

        {view.alerts.length > 0 && (
          <div className="space-y-2">
            {view.alerts.map((a) => (
              <Banner key={a.text} tone={a.tone}>
                {a.text}
              </Banner>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-md border border-slate-300">
            {(["grid", "list"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-3.5 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 ${
                  mode === m ? "bg-indigo-600 text-white" : "bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                {m === "grid" ? "Year grid" : "List"}
              </button>
            ))}
          </div>
          <label className="text-sm font-medium text-slate-800">
            Delivery
            <select
              value={delivery}
              onChange={(e) => setDelivery(e.target.value as typeof delivery)}
              className={`${inputClass} mt-1`}
            >
              <option value="all">All</option>
              <option value="in_house">In-house</option>
              <option value="external">External</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800">
            State
            <select
              value={runState}
              onChange={(e) => setRunState(e.target.value as typeof runState)}
              className={`${inputClass} mt-1`}
            >
              <option value="all">All</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {STATE_TEXT[s]}
                </option>
              ))}
            </select>
          </label>
          <p className="pb-2 text-sm text-slate-500" aria-live="polite">
            Showing {fmt(shown.length)} of {fmt(view.runs.length)} runs
          </p>
        </div>

        {selected && <RunDetail run={selected} onClose={() => setSelectedId(null)} />}

        {mode === "grid" ? (
          <CalendarGrid view={view} runs={shown} selectedId={selectedId} onSelect={select} />
        ) : (
          <RunTable runs={shown} selectedId={selectedId} onSelect={select} />
        )}
        <p className="text-xs text-slate-500">
          Left bar: indigo is in-house, amber is external. Runs after Dec 14 cannot run in person; online
          courses run to Dec 31.
        </p>

        <CostChart view={view} />
        {view.windows.length > 0 && state.analysis?.windows && (
          <WindowLane view={view} course={state.analysis.windows.course.title} />
        )}
      </section>
    </Card>
  );
}
