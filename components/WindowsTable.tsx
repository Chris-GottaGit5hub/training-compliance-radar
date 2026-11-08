import { MONTH_LABELS, type WindowSection } from "@/lib/analysis";
import { Banner } from "./ui";

const STATE_TEXT = { upcoming: "Upcoming", open: "Open now", closed: "Closed" } as const;
const STATE_CLASS = {
  upcoming: "text-slate-600",
  open: "text-indigo-700",
  closed: "text-slate-500",
} as const;
const fmt = (n: number) => n.toLocaleString("en-PH");

export function WindowsTable({ windows }: { windows: WindowSection }) {
  const { course, plan, rows } = windows;
  const missed = rows.reduce((sum, r) => sum + r.missed, 0);
  return (
    <div>
      <h3 className="font-semibold text-slate-900">Recommended course schedule</h3>
      <p className="mb-2 text-sm text-slate-600">
        <span className="font-medium">{course.title}</span> runs once a year, one month per unit,
        spread across the year so LinkedIn is not loaded all at once. Anyone who misses their window
        waits until next year.
      </p>
      {!plan.reachable && (
        <div className="mb-2">
          <Banner tone="warning">
            These windows cannot reach every target date. Lower a target or add more months.
          </Banner>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <caption className="sr-only">Window, status and completions for each unit</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Unit</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Window</th>
              {["In scope", "Completed", "Pending", "Missed"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-right font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.unit}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">{r.unit}</th>
                <td className="px-3 py-2">
                  {MONTH_LABELS[r.month - 1]} 1–{Number(r.end.slice(8))}
                  <span className={`block text-xs ${STATE_CLASS[r.state]}`}>{STATE_TEXT[r.state]}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.size)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.completed)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.pending)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.missed > 0 ? "font-semibold text-amber-700" : ""}`}>
                  {fmt(r.missed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Busiest month: {Math.round(plan.peakShare * 100)}% of in-scope staff.
        {missed > 0 && ` ${fmt(missed)} people have missed their window this year.`}
      </p>
    </div>
  );
}
