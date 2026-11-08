import { formatPeso, type Analysis } from "@/lib/analysis";
import type { RulesConfig } from "@/lib/schemas";
import { Banner } from "./ui";

const fmt = (n: number) => n.toLocaleString("en-PH");
const DELIVERY = { in_house: "In-house", external: "External" } as const;

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold ${warn ? "text-red-700" : "text-slate-900"}`}>{value}</dd>
      {sub && <dd className="text-xs text-slate-500">{sub}</dd>}
    </div>
  );
}

const head = "px-3 py-2 font-medium";

export function PlanPanel({ analysis, config }: { analysis: Analysis; config: RulesConfig }) {
  const { plan, budget } = analysis;
  if (!plan) return null;
  const after = budget.remaining - plan.totalPlannedCost;
  return (
    <div>
      <h3 className="font-semibold text-slate-900">Plan to close the gap</h3>
      <p className="mb-2 text-sm text-slate-600">
        Licensed staff finish on LinkedIn. Unlicensed staff fill the calendar runs, then pay the
        LinkedIn fee. In-person runs stop on Dec 14; online courses run to Dec 31. The plan assumes
        everyone placed completes.
      </p>
      {plan.unplaced > 0 && (
        <div className="mb-2">
          <Banner tone="warning">
            {fmt(plan.unplaced)} unlicensed {plan.unplaced === 1 ? "person has" : "people have"} no run and no
            paid LinkedIn course, so they cannot be closed by the deadline without a license or another run.
          </Banner>
        </div>
      )}
      <dl className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Planned spend" value={formatPeso(plan.totalPlannedCost)} sub="runs plus LinkedIn fees" />
        <Tile
          label="Budget after plan"
          value={config.budgetPhp > 0 ? formatPeso(after) : "—"}
          sub={config.budgetPhp > 0 ? "remaining minus planned" : "set a budget in Rules"}
          warn={config.budgetPhp > 0 && after < 0}
        />
        <Tile label="Licensed, on LinkedIn" value={fmt(plan.licensedLinkedIn)} sub="no extra cost" />
        <Tile label="Paid LinkedIn" value={fmt(plan.paidLinkedIn)} sub="unlicensed, fee charged" />
        <Tile label="Cannot close" value={fmt(plan.unplaced)} warn={plan.unplaced > 0} />
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Planned runs, whether they run, and why not</caption>
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className={`${head} text-left`}>Run</th>
                <th scope="col" className={`${head} text-right`}>People</th>
                <th scope="col" className={`${head} text-right`}>Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.runs.map((r) => (
                <tr key={r.runId}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                    {r.runId} · {r.date}
                    <span className={`block text-xs font-normal ${r.state === "held" ? "text-emerald-700" : "text-amber-700"}`}>
                      {DELIVERY[r.delivery]} · {r.state === "held" ? "runs" : `cancelled: ${r.reason}`}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.participants)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPeso(r.cost)}</td>
                </tr>
              ))}
              {plan.runs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                    No calendar runs after the as-of date. Upload a training calendar to add some.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Projected trained staff against each remaining target</caption>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className={`${head} text-left`}>Target date</th>
                <th scope="col" className={`${head} text-right`}>Projected trained</th>
                <th scope="col" className={`${head} text-right`}>Needed</th>
                <th scope="col" className={`${head} text-right`}>Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.milestones.map((m) => (
                <tr key={m.date}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">{m.label}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(m.projected)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(m.targetTrained)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${m.gap >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {m.gap >= 0 ? "On track" : `${fmt(-m.gap)} short`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
