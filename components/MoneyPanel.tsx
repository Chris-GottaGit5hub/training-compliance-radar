import { formatPercent, formatPeso, formatPesoMillions, moneySummary, type Analysis } from "@/lib/analysis";

const COLORS = { spent: "#1e3a5f", promised: "#d9932b", left: "#1e7a46" } as const;

/** ₱100M rather than ₱100.00M for whole-million allocations; otherwise two decimals. */
const millions = (n: number): string =>
  Math.abs(n) >= 1_000_000 && n % 1_000_000 === 0 ? `₱${n / 1_000_000}M` : formatPesoMillions(n);

/** The Money (spec §6): spent, promised and projected left, in words, a bar and a table. */
export function MoneyPanel({ analysis }: { analysis: Analysis }) {
  const m = moneySummary(analysis.budget, analysis.outlook);
  const rows = [
    { key: "spent", label: "Spent so far", value: m.spent, pct: m.spentPct },
    { key: "promised", label: "Promised", value: m.promised, pct: m.promisedPct },
  ] as const;

  return (
    <section aria-labelledby="money-title" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <h3 id="money-title" className="mb-3 font-semibold text-slate-900">The Money</h3>
      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-700">
            {formatPesoMillions(m.spent)} of the {millions(m.allocation)} allocation is spent. Another{" "}
            {formatPesoMillions(m.promised)} is promised to upcoming calendar runs, expected nominations and fees,{" "}
            {m.short
              ? `leaving the allocation ${formatPesoMillions(-m.left)} short by year end.`
              : `leaving about ${formatPesoMillions(m.left)} at year end.`}
          </p>
          <div
            className="flex h-[18px] border border-slate-900"
            role="img"
            aria-label={`${formatPercent(m.spentPct)} spent, ${formatPercent(m.promisedPct)} promised, ${formatPercent(m.leftPct)} left`}
          >
            <div style={{ width: `${m.barShares.spent}%`, background: COLORS.spent }} />
            <div style={{ width: `${m.barShares.promised}%`, background: COLORS.promised }} />
            <div style={{ width: `${m.barShares.left}%`, background: COLORS.left }} />
          </div>
          {m.upcomingRuns > 0 && (
            <p className="text-xs leading-relaxed text-slate-600">
              {m.upcomingRuns} calendar {m.upcomingRuns === 1 ? "run is" : "runs are"} still to come, budgeted at{" "}
              {formatPeso(m.upcomingRunsCost)}. See the full list under Where the Budget Goes.
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Annual allocation: spent, promised and projected left at year end</caption>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-slate-100">
                  <th scope="row" className="py-2 text-left font-normal text-slate-800">
                    <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5" style={{ background: COLORS[r.key] }} />
                    {r.label}
                  </th>
                  <td className="py-2 text-right font-mono tabular-nums">{formatPeso(r.value)}</td>
                  <td className="w-16 py-2 text-right font-mono text-xs tabular-nums text-slate-500">{formatPercent(r.pct)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-2 text-left font-semibold text-slate-900">
                  <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5" style={{ background: COLORS.left }} />
                  {m.short ? "Short at year end" : "Left at year end"}
                </th>
                <td className={`py-2 text-right font-mono font-semibold tabular-nums ${m.short ? "text-red-700" : "text-emerald-700"}`}>
                  {formatPeso(Math.abs(m.left))}
                </td>
                <td className="w-16 py-2 text-right font-mono text-xs tabular-nums text-slate-500">{formatPercent(m.leftPct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
