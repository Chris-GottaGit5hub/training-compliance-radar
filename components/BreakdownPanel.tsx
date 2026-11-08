"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  DIMENSIONS,
  availableDimensions,
  breakdown,
  dimensionValues,
  formatPercent,
  type Analysis,
  type BreakdownFilter,
  type Dimension,
} from "@/lib/analysis";
import type { RosterRow } from "@/lib/schemas";
import { AMBER, ChartPanel, INDIGO, shorten } from "./ChartPanel";
import { inputClass } from "./ui";

const CHART_ROWS = 12;
const label = (d: Dimension) => DIMENSIONS.find((x) => x.key === d)?.label ?? d;

function Select({
  id,
  text,
  value,
  options,
  all,
  onChange,
}: {
  id: string;
  text: string;
  value: string;
  options: (string | { value: string; label: string })[];
  all?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-700">
        {text}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {all && <option value="">{all}</option>}
        {options.map((o) => {
          const { value: v, label: l } = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function BreakdownPanel({ analysis, roster }: { analysis: Analysis; roster: RosterRow[] }) {
  const dims = useMemo(() => availableDimensions(roster), [roster]);
  const options = useMemo(
    () => Object.fromEntries(dims.map((d) => [d, dimensionValues(roster, d)])) as Record<Dimension, string[]>,
    [dims, roster],
  );
  const [chosen, setChosen] = useState<Dimension>("band");
  const [filter, setFilter] = useState<BreakdownFilter>({});
  const dimension = dims.includes(chosen) ? chosen : "unit";
  const rows = useMemo(
    () => breakdown(analysis.results, roster, dimension, filter),
    [analysis.results, roster, dimension, filter],
  );
  const chartRows = rows.slice(0, CHART_ROWS).map((r) => ({ ...r, name: shorten(r.key), Trained: r.trained, Untrained: r.untrained }));
  const total = rows.reduce((s, r) => ({ t: s.t + r.trained, u: s.u + r.untrained }), { t: 0, u: 0 });

  return (
    <div>
      <h3 className="font-semibold text-slate-900">Trained vs untrained, sliced</h3>
      <p className="mb-2 text-sm text-slate-600">
        Pick what to break down by, then narrow it with the filters. Combine any of them.
      </p>
      {dims.length < 2 && (
        <p className="mb-2 text-sm text-slate-500">
          Add pay_grade, group and sector columns to the roster to slice by band, group and sector.
        </p>
      )}
      <div className="mb-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Select
          id="breakdown-by"
          text="Break down by"
          value={dimension}
          options={dims.map((d) => ({ value: d, label: label(d) }))}
          onChange={(v) => setChosen(v as Dimension)}
        />
        {dims.map((d) => (
          <Select
            key={d}
            id={`filter-${d}`}
            text={`Filter: ${label(d)}`}
            value={filter[d] ?? ""}
            options={options[d]}
            all="All"
            onChange={(v) => setFilter((f) => ({ ...f, [d]: v }))}
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Trained and untrained by {label(dimension)}</caption>
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">{label(dimension)}</th>
                {["In scope", "Trained", "Untrained", "Rate"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">{r.key}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{r.inScope.toLocaleString("en-PH")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.trained.toLocaleString("en-PH")}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.untrained.toLocaleString("en-PH")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPercent(r.rate)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">No employees match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ChartPanel
          title={`By ${label(dimension).toLowerCase()}`}
          description={`Trained and untrained staff${rows.length > CHART_ROWS ? `, ${CHART_ROWS} largest gaps of ${rows.length}` : ""}.`}
          summary={`${total.t} trained and ${total.u} untrained across ${rows.length} groups.`}
        >
          <ResponsiveContainer width="100%" height={Math.max(120, 36 + chartRows.length * 30)}>
            <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Trained" stackId="a" fill={INDIGO} />
              <Bar dataKey="Untrained" stackId="a" fill={AMBER} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </div>
  );
}
