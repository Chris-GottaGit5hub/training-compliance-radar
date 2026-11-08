import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPercent } from "@/lib/analysis";
import type { MilestoneResult } from "@/lib/engine";
import { ChartPanel, INDIGO, SLATE, percentLabel } from "./ChartPanel";

const STATE_TEXT = { met: "Met", missed: "Missed", upcoming: "Upcoming" } as const;
const STATE_CLASS = {
  met: "text-emerald-700",
  missed: "text-red-700",
  upcoming: "text-slate-600",
} as const;

const fmt = (n: number) => n.toLocaleString("en-PH");

function resultText(m: MilestoneResult): string {
  if (m.state === "upcoming") return m.needed === 0 ? "On track" : `${fmt(m.needed)} more to train`;
  return m.gap >= 0 ? `${fmt(m.gap)} ahead` : `${fmt(-m.gap)} short`;
}

export function MilestoneCard({ milestones }: { milestones: MilestoneResult[] }) {
  const data = milestones.map((m) => ({
    label: m.label,
    Target: m.targetPct,
    Actual: m.state === "upcoming" ? null : m.actualPct,
  }));
  return (
    <div>
      <h3 className="font-semibold text-slate-900">Training targets</h3>
      <p className="mb-2 text-sm text-slate-600">
        Trained staff against the target for each date. Nov 30 is the internal target; Dec 31 is the
        official deadline.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Trained versus untrained at each target date</caption>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["Date", "Target", "Trained", "Untrained", "Result"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {milestones.map((m) => (
                <tr key={m.date}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                    {m.label}
                    <span className={`block text-xs font-normal ${STATE_CLASS[m.state]}`}>
                      {STATE_TEXT[m.state]}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.targetPct}%
                    <span className="block text-xs text-slate-500">{fmt(m.targetTrained)} people</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(m.trained)}
                    <span className="block text-xs text-slate-500">
                      {formatPercent(m.actualPct)} of {fmt(m.inScope)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(m.untrained)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${STATE_CLASS[m.state]}`}>
                    {resultText(m)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ChartPanel
          title="Target vs actual"
          description="Percent of in-scope staff trained. Future dates show the target only."
          summary={milestones
            .map((m) => `${m.label}: target ${m.targetPct}%, ${m.state === "upcoming" ? "not yet due" : `actual ${m.actualPct}%`}`)
            .join("; ")}
        >
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} width={44} />
              <Tooltip formatter={(value) => percentLabel(value)} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="Target" stroke={SLATE} strokeDasharray="5 4" dot={{ r: 3 }} />
              <Line dataKey="Actual" stroke={INDIGO} strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </div>
  );
}
