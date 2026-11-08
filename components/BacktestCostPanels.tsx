import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { backtestSeries, costBars, formatPeso, type Analysis } from "@/lib/analysis";
import type { RulesConfig } from "@/lib/schemas";
import { AMBER, ChartPanel, INDIGO, SLATE, percentLabel } from "./ChartPanel";

export function BacktestPanel({ analysis }: { analysis: Analysis }) {
  const series = backtestSeries(analysis.backtests);
  return (
    <ChartPanel
      title="Would early flags have worked?"
      description="Back-test: share of year-end gaps already flagged (recall) and of flags that stayed gaps (precision)."
      summary={series
        .map((s) => `${s.checkpoint}: recall ${percentLabel(s.recall) || "n/a"}, precision ${percentLabel(s.precision) || "n/a"}`)
        .join("; ")}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={series} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="checkpoint" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} width={44} />
          <Tooltip formatter={(value) => percentLabel(value)} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="recall" name="Recall" fill={INDIGO} radius={[4, 4, 0, 0]}>
            <LabelList dataKey="recall" position="top" fontSize={12} formatter={percentLabel} />
          </Bar>
          <Bar dataKey="precision" name="Precision" fill={SLATE} radius={[4, 4, 0, 0]}>
            <LabelList dataKey="precision" position="top" fontSize={12} formatter={percentLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}

export function CostPanel({ analysis, config }: { analysis: Analysis; config: RulesConfig }) {
  const bars = costBars(analysis.cost, config.budgetPhp > 0 ? Math.max(0, analysis.budget.remaining) : null);
  const { cost } = analysis;
  return (
    <ChartPanel
      title="Cost to close the gap"
      description="Cheapest mix of trainings for every at-risk employee, against the budget still left."
      summary={bars ? bars.map((b) => `${b.label} ${formatPeso(b.value)}`).join(", ") : "No catalog loaded."}
    >
      {!bars || !cost ? (
        <p className="py-6 text-sm text-slate-500">Upload a course catalog to see the cost to close.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={bars} margin={{ top: 22, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis hide domain={[0, "dataMax"]} />
              <Tooltip cursor={false} formatter={(value) => [formatPeso(Number(value)), "Amount"]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {bars.map((b) => (
                  <Cell key={b.key} fill={b.key === "cost" ? AMBER : SLATE} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  fontSize={12}
                  formatter={(value: unknown) => formatPeso(Number(value))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-1 text-xs text-slate-600">
            {config.budgetPhp > 0
              ? cost.remaining >= 0
                ? `Within the remaining budget, ${formatPeso(cost.remaining)} to spare.`
                : `Short of the remaining budget by ${formatPeso(-cost.remaining)}.`
              : "Set a budget in Rules to compare."}
            {cost.unpricedCount > 0 &&
              ` Lower bound: ${cost.unpricedCount} at-risk employee(s) have no qualifying course.`}
          </p>
        </>
      )}
    </ChartPanel>
  );
}

