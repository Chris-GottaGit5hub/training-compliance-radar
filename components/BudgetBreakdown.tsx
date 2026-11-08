import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPercent, formatPeso, formatPesoCompact, type Analysis } from "@/lib/analysis";
import type { RulesConfig } from "@/lib/schemas";
import { AMBER, ChartPanel, INDIGO, SLATE } from "./ChartPanel";

const peso = (value: unknown): string => (typeof value === "number" ? formatPeso(value) : "");
const DELIVERY = { in_house: "In-house", external: "External" } as const;

export function BudgetBreakdown({ analysis, config }: { analysis: Analysis; config: RulesConfig }) {
  const { budget, outlook } = analysis;
  const { commitments: c } = outlook;
  const training = Math.max(0, budget.spent - budget.subscriptions);
  const parts = [
    { name: "Spent on trainings so far", value: training, color: SLATE },
    { name: "Subscriptions", value: budget.subscriptions, color: "#94a3b8" },
    { name: "Calendar runs still to run", value: c.calendar, color: INDIGO },
    { name: c.nominationsEstimated ? "External nominations (estimate)" : "External nominations", value: c.nominations, color: AMBER },
    { name: "Paid LinkedIn fees", value: c.linkedIn, color: "#0d9488" },
  ];
  const bar = Object.fromEntries([
    ...parts.map((p) => [p.name, p.value]),
    ["Left at year end", Math.max(0, outlook.projectedBalance)],
  ]);
  const subs = config.subscriptions.map((s) => s.name).join(", ");

  return (
    <div>
      <h3 className="font-semibold text-slate-900">Where the budget goes</h3>
      <p className="mb-2 text-sm text-slate-600">
        Spend so far plus everything already promised: every calendar run still to come, external trainings
        people nominate outside the calendar, and platform subscriptions ({subs || "none listed"}).
        {c.nominationsEstimated && " The nominations figure is an estimate; set your own in Rules."}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Annual allocation split into spend, commitments and the projected balance</caption>
            <tbody className="divide-y divide-slate-100">
              {parts.map((p) => (
                <tr key={p.name}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">{p.name}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPeso(p.value)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <th scope="row" className="px-3 py-2 text-left font-semibold text-slate-900">
                  Projected balance at year end
                </th>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${outlook.projectedBalance < 0 ? "text-red-700" : ""}`}>
                  {formatPeso(outlook.projectedBalance)}
                  <span className="block text-xs font-normal text-slate-500">
                    {formatPercent(outlook.projectedPct)} of {formatPeso(budget.allocation)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ChartPanel
          title="Annual allocation"
          description="Spent, promised and left."
          summary={`${formatPeso(budget.allocation)} allocation, ${formatPeso(outlook.projectedBalance)} projected to be left.`}
        >
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={[{ name: "Allocation", ...bar }]} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <XAxis type="number" domain={[0, budget.allocation]} tickFormatter={formatPesoCompact} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip formatter={peso} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              {parts.map((p) => (
                <Bar key={p.name} dataKey={p.name} stackId="a" fill={p.color} />
              ))}
              <Bar dataKey="Left at year end" stackId="a" fill="#e2e8f0" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
      {c.runs.length > 0 && (
        <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Calendar runs still to come and what each is budgeted at</caption>
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Upcoming run</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">People</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {c.runs.map((r) => (
                <tr key={r.runId}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                    {r.title}
                    <span className="block text-xs font-normal text-slate-500">
                      {r.date} · {DELIVERY[r.delivery]}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{r.people}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPeso(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
