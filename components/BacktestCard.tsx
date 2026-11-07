import { formatRatio, type BacktestCheckpoint } from "@/lib/analysis";

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd>
        <span className="text-2xl font-semibold text-slate-900">{value}</span>
        <span className="block text-xs text-slate-500">{detail}</span>
      </dd>
    </div>
  );
}

export function BacktestCard({ backtests }: { backtests: BacktestCheckpoint[] }) {
  return (
    <section aria-labelledby="backtest-title" className="rounded-lg border border-slate-200 p-4">
      <h3 id="backtest-title" className="font-semibold text-slate-900">
        Back-test: would early flags have predicted year-end gaps?
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Recall is the share of staff untrained at year end that were already flagged at the
        checkpoint; precision is the share of flagged staff still untrained at year end — the rest
        were trained after the flag, the group early nudges target.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {backtests.map(({ label, result }) => (
          <div key={label} className="rounded-md bg-slate-50 p-3">
            <h4 className="mb-2 text-sm font-medium text-slate-800">Checkpoint: {label}</h4>
            <dl className="grid grid-cols-2 gap-3">
              <Metric
                label="Recall"
                value={formatRatio(result.recall)}
                detail={`${result.caughtEarly} of ${result.nonCompliantAtYearEnd} untrained at year end`}
              />
              <Metric
                label="Precision"
                value={formatRatio(result.precision)}
                detail={`${result.caughtEarly} of ${result.flaggedAtCheckpoint} flagged`}
              />
            </dl>
            {result.notCoveredAtCheckpoint > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {result.notCoveredAtCheckpoint} joined after this date, so they could not be
                flagged yet.
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Uses all attendance in your file through Dec 31, so it is most meaningful with full-year
        data.
      </p>
    </section>
  );
}
