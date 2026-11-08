import type { ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPercent, formatPeso, formatPesoCompact, type BudgetReport } from "@/lib/analysis";
import { AMBER, ChartPanel, INDIGO, SLATE } from "./ChartPanel";

const peso = (value: unknown): string => (typeof value === "number" ? formatPeso(value) : "");

function Tile({ label, children, sub }: { label: string; children: ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold text-slate-900">{children}</dd>
      {sub && <dd className="text-xs text-slate-500">{sub}</dd>}
    </div>
  );
}

export function BudgetPanel({ report, hasPlan }: { report: BudgetReport; hasPlan: boolean }) {
  const { allocation, months } = report;
  const burn = [
    { label: "Start", Remaining: allocation, Planned: hasPlan ? allocation : null },
    ...months.map((m) => ({
      label: m.label,
      Remaining: m.remaining,
      Planned: m.planned === null ? null : allocation - m.planned,
    })),
  ];
  const pace = months.map((m) => ({ label: m.label, Spent: m.spent, Trained: m.trained }));
  const last = months.filter((m) => m.spent !== null).at(-1);

  return (
    <div>
      <h3 className="font-semibold text-slate-900">Budget burn-down</h3>
      <p className="mb-2 text-sm text-slate-600">
        The annual allocation shrinks as attendance costs are spent. Every route counts: LinkedIn fees
        for unlicensed staff, in-house runs and external courses.
      </p>
      <dl className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Annual allocation">{formatPeso(allocation)}</Tile>
        <Tile label="Spent so far" sub={`${formatPercent(report.percentSpent)} of allocation`}>
          {formatPeso(report.spent)}
        </Tile>
        <Tile label="Remaining">
          <span className={report.remaining < 0 ? "text-red-700" : ""}>{formatPeso(report.remaining)}</span>
        </Tile>
        <Tile label="Trained so far">{report.trained.toLocaleString("en-PH")}</Tile>
        <Tile label="Spend per trained person">
          {report.costPerTrained === null ? "—" : formatPeso(report.costPerTrained)}
        </Tile>
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Budget remaining"
          description={hasPlan ? "Actual (solid) and planned (dashed) balance by month." : "Balance at each month end."}
          summary={`Started at ${formatPeso(allocation)}; ${last ? `${formatPeso(last.remaining ?? 0)} left after ${last.label}` : "no spend yet"}.`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={burn} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatPesoCompact} tick={{ fontSize: 12 }} width={64} domain={[0, "auto"]} />
              <Tooltip formatter={peso} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="Remaining" stroke={INDIGO} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              {hasPlan && (
                <Line dataKey="Planned" stroke={AMBER} strokeDasharray="5 4" dot={false} connectNulls={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel
          title="Money spent vs people trained"
          description="Cumulative spend (bars) against trained staff (line)."
          summary={`${formatPeso(report.spent)} spent and ${report.trained} trained so far.`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={pace} margin={{ top: 12, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tickFormatter={formatPesoCompact} tick={{ fontSize: 12 }} width={64} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} width={44} />
              <Tooltip />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="Spent" fill={SLATE} radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" dataKey="Trained" stroke={INDIGO} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </div>
  );
}
