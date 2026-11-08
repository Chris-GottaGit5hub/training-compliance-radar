export type Status =
  | "COMPLIANT"
  | "AT_RISK"
  | "EXEMPT"
  | "EXCLUDED"
  | "NOT_COVERED";

export interface EmployeeResult {
  employeeId: string;
  unit: string;
  status: Status;
  reason: string;
  qualifyingCount: number;
}

export interface UnitSummary {
  unit: string;
  covered: number;
  compliant: number;
  atRisk: number;
  atRiskLicensed: number;
  atRiskUnlicensed: number;
  /** Percent 0-100, rounded half-up to 1 decimal; 0 when covered = 0. */
  complianceRate: number;
}

export interface OrgSummary {
  covered: number;
  compliant: number;
  atRisk: number;
  exempt: number;
  excluded: number;
  notCovered: number;
  complianceRate: number;
  monthsRemaining: number;
  deadline: string;
  unitsRanked: UnitSummary[];
}

export interface EngineWarnings {
  /** Attendance rows whose employee_id is not in the roster (ignored). */
  orphanAttendanceRows: number;
  /** Exact duplicate attendance rows (same employee, title, date) counted once. */
  duplicateAttendanceRows: number;
}

export interface EngineRun {
  results: EmployeeResult[];
  warnings: EngineWarnings;
}

export interface BacktestResult {
  flaggedAtCheckpoint: number;
  nonCompliantAtYearEnd: number;
  caughtEarly: number;
  /** AT_RISK at year end but not yet covered (e.g. hired later) at the checkpoint. */
  notCoveredAtCheckpoint: number;
  /** caughtEarly / nonCompliantAtYearEnd, as a 0-1 ratio; null if the denominator is 0. */
  recall: number | null;
  /** caughtEarly / flaggedAtCheckpoint, as a 0-1 ratio; null if the denominator is 0. */
  precision: number | null;
}

export type MilestoneState = "met" | "missed" | "upcoming";

/** One target date (spec §4.5). Counts only, no employee IDs. */
export interface MilestoneResult {
  date: string;
  label: string;
  targetPct: number;
  state: MilestoneState;
  inScope: number;
  trained: number;
  untrained: number;
  /** Trained share of in-scope staff, percent rounded to 1 decimal. */
  actualPct: number;
  targetTrained: number;
  /** trained - targetTrained; negative means short of the target. */
  gap: number;
  needed: number;
}

export interface CostToClose {
  costToClose: number;
  /** At-risk employees whose route has no qualifying course (cost is a lower bound). */
  unpricedCount: number;
  remaining: number;
  covered: boolean;
}
