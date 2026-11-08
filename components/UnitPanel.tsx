import { useEffect, useMemo, useRef } from "react";
import {
  atRiskEmployees,
  buildAtRiskCsv,
  exportFileName,
  formatPercent,
  type AtRiskRow,
} from "@/lib/analysis";
import type { UnitSummary } from "@/lib/engine";
import type { CatalogRow, RulesConfig } from "@/lib/schemas";
import { AiPanel } from "./AiPanel";
import { downloadTextFile } from "./download";
import type { AiActions } from "./useAiActions";
import type { useRadarState } from "./useRadarState";
import { Card, StepHeading, buttonClass } from "./ui";

type RadarState = ReturnType<typeof useRadarState>;

function EmployeeTable({ rows }: { rows: AtRiskRow[] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <caption className="sr-only">At-risk employees in this unit</caption>
        <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Name
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Position
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
              Employee ID
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Licensed
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.employeeId}>
              <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                {r.name}
              </th>
              <td className="px-3 py-2">{r.position}</td>
              <td className="hidden px-3 py-2 text-slate-500 sm:table-cell">{r.employeeId}</td>
              <td className="px-3 py-2">{r.licensed ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnitDetails({
  unit,
  rows,
  asOfDate,
  config,
  catalog,
  ai,
  onClose,
}: {
  unit: UnitSummary;
  rows: AtRiskRow[];
  asOfDate: string;
  config: RulesConfig;
  catalog: CatalogRow[] | null;
  ai: AiActions;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Bring the panel into view and move focus to it when a unit is opened.
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            ref={heading}
            tabIndex={-1}
            className="text-xl font-semibold text-slate-900 focus:outline-none"
          >
            {unit.unit}
          </h3>
          <p className="text-sm text-slate-600">
            {unit.atRisk} at risk of {unit.covered} covered ({unit.atRiskLicensed} licensed,{" "}
            {unit.atRiskUnlicensed} unlicensed) · compliance {formatPercent(unit.complianceRate)}
          </p>
        </div>
        <button type="button" onClick={onClose} className={buttonClass("secondary")}>
          Close panel
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Nobody in this unit is at risk as of {asOfDate}.
        </p>
      ) : (
        <EmployeeTable rows={rows} />
      )}

      <AiPanel
        unit={unit}
        rows={rows}
        catalog={catalog}
        ai={ai}
        config={config}
        exportButton={
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() =>
              downloadTextFile(exportFileName(unit.unit, asOfDate), buildAtRiskCsv(rows))
            }
            className={buttonClass("secondary")}
          >
            Export at-risk CSV
          </button>
        }
      />
    </div>
  );
}

export function UnitPanel({ state, ai }: { state: RadarState; ai: AiActions }) {
  const { analysis, roster, catalog, config, selectedUnit, selectUnit } = state;
  const unit = analysis?.org.unitsRanked.find((u) => u.unit === selectedUnit);
  const rows = useMemo(
    () =>
      analysis && roster && unit ? atRiskEmployees(analysis.results, roster, unit.unit) : [],
    [analysis, roster, unit],
  );

  return (
    <Card>
      <section aria-labelledby="step-unit-title" id="step-unit">
        <StepHeading
          id="step-unit-title"
          step={4}
          title="Unit panel"
          description="At-risk employees for one unit, with AI drafting and export."
        />
        {unit && config ? (
          <UnitDetails
            key={unit.unit}
            unit={unit}
            rows={rows}
            asOfDate={config.asOfDate}
            config={config}
            catalog={catalog}
            ai={ai}
            onClose={() => selectUnit(null)}
          />
        ) : (
          <p className="text-sm text-slate-500">
            Select a unit in the dashboard (chart or table) to see who is at risk.
          </p>
        )}
      </section>
    </Card>
  );
}
