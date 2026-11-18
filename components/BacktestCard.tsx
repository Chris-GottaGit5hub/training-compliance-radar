import { earlyWarningSummary, type BacktestCheckpoint } from "@/lib/analysis";

const n = (x: number): string => x.toLocaleString("en-PH");
const share = (pct: number | null): string => (pct === null ? "" : ` (${pct}%)`);

/**
 * Early Warning Check (spec §4.1 Display): the back-test in plain words. It rewinds to each
 * checkpoint, takes everyone untrained then, and compares them with who was still untrained
 * on Dec 31. Recall and precision stay in small print for the PRD success metric.
 */
export function BacktestCard({ backtests }: { backtests: BacktestCheckpoint[] }) {
  const year = backtests[0]?.checkpoint.slice(0, 4) ?? "";
  return (
    <section aria-labelledby="backtest-title" className="rounded-lg border border-slate-200 p-4">
      <h3 id="backtest-title" className="font-semibold text-slate-900">
        Early Warning Check
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Would the warnings have been right? The app goes back to each date, takes everyone who was
        untrained then, and compares them with who was still untrained at year end.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {backtests.map(({ label, result }) => {
          const s = earlyWarningSummary(result);
          return (
            <div key={label} className="space-y-3 rounded-md bg-slate-50 p-3">
              <h4 className="text-sm font-semibold text-slate-900">
                On {label}, {n(s.flagged)} {s.flagged === 1 ? "person was" : "people were"} flagged
              </h4>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs font-medium text-slate-600">Caught up on their own</dt>
                  <dd className="font-mono text-xl font-semibold text-emerald-700">
                    {n(s.caughtUp)}
                    <span className="text-sm font-normal">{share(s.caughtUpPct)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-600">Still untrained at year end</dt>
                  <dd className="font-mono text-xl font-semibold text-red-700">
                    {n(s.stillUntrained)}
                    <span className="text-sm font-normal">{share(s.stillUntrainedPct)}</span>
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-slate-700">
                {s.missed === 0
                  ? `Missed nobody: all ${n(s.yearEndGaps)} people untrained at year end were already on this list.`
                  : `Missed ${n(s.missed)} of the ${n(s.yearEndGaps)} people untrained at year end${
                      s.joinedLater > 0 ? `; ${n(s.joinedLater)} of them joined after ${label}, so they could not be flagged yet` : ""
                    }.`}
              </p>
              <p className="text-xs text-slate-500">
                Recall {s.recallPct === null ? "—" : `${s.recallPct}%`} · precision{" "}
                {s.precisionPct === null ? "—" : `${s.precisionPct}%`}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        What it shows: the list only misses people who join after the date, and the later the
        date, the more of the flagged people stay untrained unless someone acts. The sample data is
        a simulated full year (through Dec 31, {year}), so this check can run today. With your own
        data, run it on a finished year, such as last year&apos;s files, to test the method.
      </p>
    </section>
  );
}
