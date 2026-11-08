import { formatPercent } from "@/lib/analysis";
import type { UnitSummary } from "@/lib/engine";

const HEAD = "px-3 py-2 text-right font-medium";
const CELL = "px-3 py-2 text-right tabular-nums";

export function UnitTable({
  units,
  selectedUnit,
  onSelect,
}: {
  units: UnitSummary[];
  selectedUnit: string | null;
  onSelect: (unit: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Units ranked by risk: most at-risk employees first, then lowest compliance, then name.
          Select a unit to open its panel.
        </caption>
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Unit
            </th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`}>
              In scope
            </th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`}>
              Trained
            </th>
            <th scope="col" className={HEAD}>
              Untrained
            </th>
            <th scope="col" className={`${HEAD} hidden md:table-cell`}>
              Licensed
            </th>
            <th scope="col" className={`${HEAD} hidden md:table-cell`}>
              Unlicensed
            </th>
            <th scope="col" className={HEAD}>
              Compliance
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {units.map((u) => {
            const selected = u.unit === selectedUnit;
            return (
              <tr
                key={u.unit}
                onClick={() => onSelect(u.unit)}
                className={`cursor-pointer hover:bg-slate-50 ${selected ? "bg-indigo-50" : ""}`}
              >
                <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                  <button
                    type="button"
                    onClick={() => onSelect(u.unit)}
                    aria-current={selected ? "true" : undefined}
                    className="text-left text-indigo-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  >
                    {u.unit}
                  </button>
                </th>
                <td className={`${CELL} hidden sm:table-cell`}>{u.covered}</td>
                <td className={`${CELL} hidden sm:table-cell`}>{u.compliant}</td>
                <td className={`${CELL} font-semibold`}>{u.atRisk}</td>
                <td className={`${CELL} hidden md:table-cell`}>{u.atRiskLicensed}</td>
                <td className={`${CELL} hidden md:table-cell`}>{u.atRiskUnlicensed}</td>
                <td className={CELL}>{formatPercent(u.complianceRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
