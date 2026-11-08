import { atRiskEmployees, buildAtRiskCsv, exportFileName } from "@/lib/analysis";
import { BacktestCard } from "./BacktestCard";
import { BreakdownPanel } from "./BreakdownPanel";
import { BudgetPanel } from "./BudgetPanel";
import { KpiCards } from "./KpiCards";
import { MilestoneCard } from "./MilestoneCard";
import { UnitChart } from "./UnitChart";
import { UnitTable } from "./UnitTable";
import { downloadTextFile } from "./download";
import type { useRadarState } from "./useRadarState";
import { Banner, Card, StepHeading, buttonClass } from "./ui";

type RadarState = ReturnType<typeof useRadarState>;

function Notices({ state }: { state: RadarState }) {
  const { analysis, analysisError } = state;
  if (analysisError) return <Banner tone="error">{analysisError}</Banner>;
  if (!analysis) return null;
  const { warnings, org } = analysis;
  return (
    <div className="space-y-2">
      {org.covered === 0 && (
        <Banner tone="warning">
          No employees are covered as of this date. Check the year and as-of date in Rules.
        </Banner>
      )}
      {warnings.orphanAttendanceRows > 0 && (
        <Banner tone="info">
          {warnings.orphanAttendanceRows} attendance row(s) were ignored because their employee_id
          is not in the roster.
        </Banner>
      )}
      {warnings.duplicateAttendanceRows > 0 && (
        <Banner tone="info">
          {warnings.duplicateAttendanceRows} duplicate attendance row(s) were counted once.
        </Banner>
      )}
    </div>
  );
}

export function DashboardStep({ state }: { state: RadarState }) {
  const { analysis, config, ready, issues, catalog, roster, selectedUnit, selectUnit } = state;
  const hasIssues = Object.keys(issues).length > 0;

  const exportAll = () => {
    if (!analysis || !roster || !config) return;
    const rows = atRiskEmployees(analysis.results, roster);
    downloadTextFile(exportFileName(null, config.asOfDate), buildAtRiskCsv(rows));
  };

  return (
    <Card>
      <section aria-labelledby="step-dashboard-title" id="step-dashboard">
        <StepHeading
          id="step-dashboard-title"
          step={3}
          title="Dashboard"
          description="Trained vs untrained as of the chosen date, against your targets, ranked by risk."
        />
        {analysis && (
          <button
            type="button"
            onClick={() => window.print()}
            className={`${buttonClass("secondary")} mb-3 print:hidden`}
          >
            Print report
          </button>
        )}
        {!ready && (
          <p className="text-sm text-slate-500">
            Load roster and attendance in step 1 to see the dashboard.
          </p>
        )}
        {ready && hasIssues && (
          <Banner tone="warning">Fix the highlighted rules in step 2 to see results.</Banner>
        )}
        <Notices state={state} />
        {analysis && config && (
          <div className="mt-4 space-y-6" aria-live="polite">
            <KpiCards analysis={analysis} config={config} hasCatalog={catalog !== null} />
            <MilestoneCard milestones={analysis.milestones} />
            {config.budgetPhp > 0 ? (
              <BudgetPanel report={analysis.budget} hasPlan={false} />
            ) : (
              <Banner tone="info">
                Set the annual training budget in Rules to see the burn-down report: money spent,
                remaining, and people trained through the year.
              </Banner>
            )}
            <UnitChart
              units={analysis.org.unitsRanked}
              selectedUnit={selectedUnit}
              onSelect={selectUnit}
            />
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">Units ranked by risk</h3>
                <button
                  type="button"
                  onClick={exportAll}
                  disabled={analysis.org.atRisk === 0}
                  className={buttonClass("secondary")}
                >
                  Export all at-risk CSV
                </button>
              </div>
              <UnitTable
                units={analysis.org.unitsRanked}
                selectedUnit={selectedUnit}
                onSelect={selectUnit}
              />
            </div>
            {roster && <BreakdownPanel analysis={analysis} roster={roster} />}
            <BacktestCard backtests={analysis.backtests} />
          </div>
        )}
      </section>
    </Card>
  );
}
