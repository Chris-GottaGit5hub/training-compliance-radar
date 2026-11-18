import { describe, expect, it } from "vitest";
import { earlyWarningSummary } from "@/lib/analysis";

const result = (flagged: number, gaps: number, caught: number, joined: number) => ({
  flaggedAtCheckpoint: flagged,
  nonCompliantAtYearEnd: gaps,
  caughtEarly: caught,
  notCoveredAtCheckpoint: joined,
  recall: gaps > 0 ? caught / gaps : null,
  precision: flagged > 0 ? caught / flagged : null,
});

describe("earlyWarningSummary (spec §4.1 Display)", () => {
  it("explains the Jun 30 sample checkpoint in plain counts", () => {
    expect(earlyWarningSummary(result(3631, 891, 872, 19))).toEqual({
      flagged: 3631,
      caughtUp: 2759,
      caughtUpPct: 76,
      stillUntrained: 872,
      stillUntrainedPct: 24,
      yearEndGaps: 891,
      missed: 19,
      joinedLater: 19,
      recallPct: 98,
      precisionPct: 24,
    });
  });

  it("reports no misses when every year-end gap was flagged (Sep 30 sample)", () => {
    const s = earlyWarningSummary(result(1691, 891, 891, 0));
    expect(s).toMatchObject({ caughtUp: 800, caughtUpPct: 47, stillUntrained: 891, stillUntrainedPct: 53, missed: 0, recallPct: 100 });
  });

  it("keeps the two shares summing to 100 and handles nobody flagged", () => {
    const s = earlyWarningSummary(result(3, 1, 1, 0));
    expect((s.caughtUpPct ?? 0) + (s.stillUntrainedPct ?? 0)).toBe(100);
    const none = earlyWarningSummary(result(0, 0, 0, 0));
    expect(none).toMatchObject({ caughtUpPct: null, stillUntrainedPct: null, recallPct: null, precisionPct: null });
  });
});
