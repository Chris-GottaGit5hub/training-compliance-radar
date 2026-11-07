import { isRealDate, isWithinYear } from "@/lib/schemas/dates";
import type { RulesConfig } from "@/lib/schemas/config";
import type { AttendanceRow, RosterRow } from "@/lib/schemas/rows";
import { deadlineOf } from "./dates";
import { evaluateRoster } from "./status";
import type { BacktestResult, Status } from "./types";

const ratioOrNull = (n: number, d: number): number | null => (d === 0 ? null : n / d);

/**
 * Spec §4.1. Runs the engine at `checkpointDate` and at Dec 31 with the same
 * config; asOfDate in `config` is ignored. Returns counts only (no IDs).
 */
export function backtest(
  roster: readonly RosterRow[],
  attendance: readonly AttendanceRow[],
  config: RulesConfig,
  checkpointDate: string,
): BacktestResult {
  const deadline = deadlineOf(config.year);
  if (
    !isRealDate(checkpointDate) ||
    !isWithinYear(checkpointDate, config.year) ||
    checkpointDate >= deadline
  ) {
    throw new RangeError(
      `checkpointDate must be a real date in ${config.year} before ${deadline}`,
    );
  }

  const statusById = (asOfDate: string) =>
    new Map<string, Status>(
      evaluateRoster(roster, attendance, { ...config, asOfDate }).results.map((r) => [
        r.employeeId,
        r.status,
      ]),
    );
  const atCheckpoint = statusById(checkpointDate);
  const atYearEnd = statusById(deadline);

  let flagged = 0;
  for (const status of atCheckpoint.values()) if (status === "AT_RISK") flagged++;

  let nonCompliant = 0;
  let caughtEarly = 0;
  let notCoveredAtCheckpoint = 0;
  for (const [id, status] of atYearEnd) {
    if (status !== "AT_RISK") continue;
    nonCompliant++;
    const earlier = atCheckpoint.get(id);
    if (earlier === "AT_RISK") caughtEarly++;
    else if (earlier !== "COMPLIANT") notCoveredAtCheckpoint++;
  }

  return {
    flaggedAtCheckpoint: flagged,
    nonCompliantAtYearEnd: nonCompliant,
    caughtEarly,
    notCoveredAtCheckpoint,
    recall: ratioOrNull(caughtEarly, nonCompliant),
    precision: ratioOrNull(caughtEarly, flagged),
  };
}
