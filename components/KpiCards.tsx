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

/** The annual allocation still unspent (spec §4.7), and what is left after closing the gap. */
function BalanceKpi({ analysis, config }: Props) {
  const { budget, cost } = analysis;
  if (config.budgetPhp <= 0) {
    return (
      <Kpi label="Outstanding balance" value="—">
        Set the annual budget in Rules
      </Kpi>
    );
  }
  return (
    <Kpi
      label="Outstanding balance"
      value={<span className={budget.remaining < 0 ? "text-red-700" : ""}>{formatPeso(budget.remaining)}</span>}
    >
      {formatPercent(budget.percentSpent)} of {formatPeso(budget.allocation)} spent
      {cost && (
        <span className={`mt-1 block ${cost.remaining < 0 ? "font-medium text-red-700" : "text-emerald-700"}`}>
          {cost.remaining < 0
            ? `Short by ${formatPeso(-cost.remaining)} after closing the gap`
            : `${formatPeso(cost.remaining)} left after closing the gap`}
        </span>
      )}
    </Kpi>
  );
}

function CostKpi({ analysis }: Props) {
  const { cost, costSource } = analysis;
  if (!cost) {
    return (
      <Kpi label="Cost to close" value="—">
        Upload a catalog or a training calendar to enable
      </Kpi>
    );
  }
  return (
    <Kpi label="Cost to close" value={formatPeso(cost.costToClose)}>
      {costSource === "plan"
        ? "Cheapest mix of calendar runs, nominated external and LinkedIn"
        : "Estimate from catalog prices; add a calendar for run-based costs"}
      {cost.unpricedCount > 0 && (
        <span className="mt-1 block text-amber-700">
          Lower bound: {cost.unpricedCount} at-risk{" "}
          {cost.unpricedCount === 1 ? "employee has" : "employees have"} no training or fee route
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

function TargetKpi({ analysis }: { analysis: Analysis }) {
  const { milestones } = analysis;
  const m = milestones.find((x) => x.state === "upcoming") ?? milestones[milestones.length - 1];
  if (!m) return null;
  return (
    <Kpi label="Next target" value={`${m.targetPct}% by ${m.label}`}>
      {m.needed === 0
        ? "Target already reached"
        : `${m.needed.toLocaleString("en-PH")} more to train (${m.targetTrained.toLocaleString("en-PH")} needed)`}
    </Kpi>
  );
}

export function KpiCards(props: Props) {
  const { org } = props.analysis;
  const fmt = (n: number) => n.toLocaleString("en-PH");
  const licensed = org.unitsRanked.reduce((sum, u) => sum + u.atRiskLicensed, 0);
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Trained" value={fmt(org.compliant)}>
          {formatPercent(org.complianceRate)} of {fmt(org.covered)} in scope
        </Kpi>
        <Kpi label="Untrained (at risk)" value={fmt(org.atRisk)}>
          {licensed} licensed · {org.atRisk - licensed} unlicensed
        </Kpi>
        <TargetKpi analysis={props.analysis} />
        <Kpi label="Months left" value={org.monthsRemaining}>
          until {org.deadline}
        </Kpi>
        <CostKpi {...props} />
        <BalanceKpi {...props} />
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        In scope = employees the rule applies to as of this date.
        {props.analysis.leftOut.length > 0 &&
          ` Left out: ${props.analysis.leftOut.map((i) => `${fmt(i.count)} ${i.label}`).join(" · ")}.`}
      </p>
    </>
  );
}
