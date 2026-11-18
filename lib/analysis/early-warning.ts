import type { BacktestResult } from "@/lib/engine";

/** The back-test in plain counts for the Early Warning Check card (spec §4.1 Display). */
export interface EarlyWarningSummary {
  flagged: number;
  /** Flagged at the checkpoint but trained (or gone) by year end. */
  caughtUp: number;
  caughtUpPct: number | null;
  /** Flagged and still untrained at year end (the precision numerator). */
  stillUntrained: number;
  stillUntrainedPct: number | null;
  yearEndGaps: number;
  /** Untrained at year end but not flagged at the checkpoint. */
  missed: number;
  /** Of the year-end gaps, those who joined after the checkpoint. */
  joinedLater: number;
  recallPct: number | null;
  precisionPct: number | null;
}

const pct = (ratio: number | null): number | null => (ratio === null ? null : Math.round(ratio * 100));

export function earlyWarningSummary(r: BacktestResult): EarlyWarningSummary {
  const stillUntrainedPct = pct(r.precision);
  return {
    flagged: r.flaggedAtCheckpoint,
    caughtUp: r.flaggedAtCheckpoint - r.caughtEarly,
    // Complement of the rounded share, so the two always add up to 100.
    caughtUpPct: stillUntrainedPct === null ? null : 100 - stillUntrainedPct,
    stillUntrained: r.caughtEarly,
    stillUntrainedPct,
    yearEndGaps: r.nonCompliantAtYearEnd,
    missed: r.nonCompliantAtYearEnd - r.caughtEarly,
    joinedLater: r.notCoveredAtCheckpoint,
    recallPct: pct(r.recall),
    precisionPct: stillUntrainedPct,
  };
}
