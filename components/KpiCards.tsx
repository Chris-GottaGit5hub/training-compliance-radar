import type { ReactNode } from "react";
import { formatPercent, formatPeso, type Analysis } from "@/lib/analysis";
import type { RulesConfig } from "@/lib/schemas";

function Kpi({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="mt-1">
        <span className="text-2xl font-semibold text-slate-900 sm:text-3xl">{value}</span>
        {children && <span className="mt-1 block text-xs text-slate-500">{children}</span>}
      </dd>
    </div>
  );
}

function CostKpi({ analysis, config, hasCatalog }: Props) {
  const { cost } = analysis;
  if (!hasCatalog || !cost) {
    return (
      <Kpi label="Cost to close" value="—">
        Upload a catalog to enable
      </Kpi>
    );
  }
  const budget = config.budgetPhp;
  return (
    <Kpi label="Cost to close" value={formatPeso(cost.costToClose)}>
      {budget > 0 ? (
        cost.remaining >= 0 ? (
          <span className={cost.covered ? "text-emerald-700" : "text-amber-700"}>
            {formatPeso(budget)} budget · {formatPeso(cost.remaining)} left
          </span>
        ) : (
          <span className="font-medium text-red-700">
            Short by {formatPeso(-cost.remaining)} of {formatPeso(budget)} budget
          </span>
        )
      ) : (
        "Set a budget in Rules to compare"
      )}
      {cost.unpricedCount > 0 && (
        <span className="mt-1 block text-amber-700">
          Lower bound: {cost.unpricedCount} at-risk{" "}
          {cost.unpricedCount === 1 ? "employee has" : "employees have"} no qualifying course
        </span>
      )}
    </Kpi>
  );
}

interface Props {
  analysis: Analysis;
  config: RulesConfig;
  hasCatalog: boolean;
}

export function KpiCards(props: Props) {
  const { org } = props.analysis;
  const licensed = org.unitsRanked.reduce((sum, u) => sum + u.atRiskLicensed, 0);
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi label="Covered employees" value={org.covered.toLocaleString("en-PH")}>
        {org.exempt} exempt · {org.excluded} excluded · {org.notCovered} not covered
      </Kpi>
      <Kpi label="Compliance" value={formatPercent(org.complianceRate)}>
        {org.compliant.toLocaleString("en-PH")} of {org.covered.toLocaleString("en-PH")} covered
      </Kpi>
      <Kpi label="At risk" value={org.atRisk.toLocaleString("en-PH")}>
        {licensed} licensed · {org.atRisk - licensed} unlicensed
      </Kpi>
      <Kpi label="Months left" value={org.monthsRemaining}>
        until {org.deadline}
      </Kpi>
      <CostKpi {...props} />
    </dl>
  );
}
