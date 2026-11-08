import type { RulesConfig } from "@/lib/schemas/config";
import type { AttendanceRow, RosterRow } from "@/lib/schemas/rows";
import { complianceRate } from "./summary";
import { evaluateRoster } from "./status";
import type { EmployeeResult, MilestoneResult } from "./types";

/** Mar 31, Jun 30, Sep 30 and the internal Nov 30 target (spec §2.4). */
export const MILESTONE_POINTS = [
  { monthDay: "03-31", label: "Mar 31" },
  { monthDay: "06-30", label: "Jun 30" },
  { monthDay: "09-30", label: "Sep 30" },
  { monthDay: "11-30", label: "Nov 30" },
] as const;

export const milestoneDates = (year: number): string[] =>
  MILESTONE_POINTS.map((p) => `${year}-${p.monthDay}`);

/** Spec §4.5. `current` is the engine run at config.asOfDate, reused to avoid a repeat run. */
export function evaluateMilestones(
  roster: readonly RosterRow[],
  attendance: readonly AttendanceRow[],
  config: RulesConfig,
  current?: readonly EmployeeResult[],
): MilestoneResult[] {
  const now = current ?? evaluateRoster(roster, attendance, config).results;

  return MILESTONE_POINTS.map(({ monthDay, label }, i) => {
    const date = `${config.year}-${monthDay}`;
    const upcoming = date > config.asOfDate;
    const results =
      date >= config.asOfDate
        ? now
        : evaluateRoster(roster, attendance, { ...config, asOfDate: date }).results;

    let trained = 0;
    let untrained = 0;
    for (const r of results) {
      if (r.status === "COMPLIANT") trained++;
      else if (r.status === "AT_RISK") untrained++;
    }
    const inScope = trained + untrained;
    const targetPct = config.milestoneTargets[i] ?? 0;
    const targetTrained = Math.ceil((targetPct * inScope) / 100 - 1e-9);
    const gap = trained - targetTrained;

    return {
      date,
      label,
      targetPct,
      state: upcoming ? "upcoming" : gap >= 0 ? "met" : "missed",
      inScope,
      trained,
      untrained,
      actualPct: complianceRate(trained, inScope),
      targetTrained,
      gap,
      needed: Math.max(0, -gap),
    };
  });
}
