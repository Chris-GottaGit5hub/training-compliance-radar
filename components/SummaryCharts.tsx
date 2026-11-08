import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { statusBreakdown, topAtRiskUnits, type Analysis } from "@/lib/analysis";
import type { RulesConfig } from "@/lib/schemas";
import { BacktestPanel, CostPanel } from "./BacktestCostPanels";
import { AMBER, ChartPanel, FILL, SWATCH, shorten } from "./ChartPanel";

function StatusPanel({ analysis }: { analysis: Analysis }) {
  const slices = statusBreakdown(analysis.org);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const row = { name: "Employees", ...Object.fromEntries(slices.map((s) => [s.key, s.value])) };
  return (
    <ChartPanel
      title="Where everyone stands"
      description="All employees in the roster, by status as of the chosen date."
      summary={slices.map((s) => `${s.label} ${s.value}`).join(", ")}
    >
      <ResponsiveContainer width="100%" height={48}>
        <BarChart data={[row]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, Math.max(total, 1)]} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip cursor={false} />
          {slices.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="status" fill={FILL[s.key]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SWATCH[s.key]}`} />
            <span>
              {s.label}: <strong>{s.value}</strong> ({s.percent}%)
            </span>
          </li>
        ))}
      </ul>
    </ChartPanel>
  );
}

function UnitsPanel({ analysis }: { analysis: Analysis }) {
  const bars = topAtRiskUnits(analysis.org);
  return (
    <ChartPanel
      title="Highest-risk units"
      description="At-risk employees in the units that need attention first."
      summary={bars.length === 0 ? "Nobody is at risk." : bars.map((b) => `${b.unit} ${b.atRisk}`).join(", ")}
    >
      {bars.length === 0 ? (
        <p className="py-6 text-sm text-emerald-800">Nobody is at risk as of this date.</p>
      ) : (
        <ResponsiveContainer width="100%" height={bars.length * 34 + 16}>
          <BarChart data={bars} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="unit"
              width={130}
              interval={0}
              tick={{ fontSize: 12 }}
              tickFormatter={shorten}
            />
            <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(value) => [value, "At-risk employees"]} />
            <Bar dataKey="atRisk" name="At risk" fill={AMBER} radius={[0, 4, 4, 0]}>
              <LabelList dataKey="atRisk" position="right" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}

/** Charts for the executive summary. Drawn from the compliance engine, never from AI text. */
export function SummaryCharts({ analysis, config }: { analysis: Analysis; config: RulesConfig }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <StatusPanel analysis={analysis} />
      <UnitsPanel analysis={analysis} />
      <BacktestPanel analysis={analysis} />
      <CostPanel analysis={analysis} config={config} />
    </div>
  );
}
