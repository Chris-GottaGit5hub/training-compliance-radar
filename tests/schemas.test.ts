import { describe, expect, it } from "vitest";
import {
  defaultRulesConfig,
  isRealDate,
  isWithinYear,
  rulesConfigSchema,
} from "@/lib/schemas";
import { config } from "./helpers/fixtures";

describe("isRealDate", () => {
  it("accepts real calendar dates, including leap days", () => {
    expect(isRealDate("2026-12-31")).toBe(true);
    expect(isRealDate("2024-02-29")).toBe(true);
    expect(isRealDate("2000-02-29")).toBe(true);
  });

  it("rejects impossible dates and wrong formats", () => {
    for (const bad of ["2026-02-30", "2025-02-29", "1900-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-1-5", "05/01/2026", "", "2026-01-01T00:00"]) {
      expect(isRealDate(bad), bad).toBe(false);
    }
  });
});

describe("isWithinYear", () => {
  it("compares dates as strings", () => {
    expect(isWithinYear("2026-01-01", 2026)).toBe(true);
    expect(isWithinYear("2026-12-31", 2026)).toBe(true);
    expect(isWithinYear("2025-12-31", 2026)).toBe(false);
  });
});

describe("rulesConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(rulesConfigSchema.safeParse(config()).success).toBe(true);
  });

  it("requires asOfDate and lateHireCutoff to fall within the year", () => {
    const asOf = rulesConfigSchema.safeParse(config({ asOfDate: "2027-01-02" }));
    const cutoff = rulesConfigSchema.safeParse(config({ lateHireCutoff: "2025-10-01" }));
    expect(asOf.success).toBe(false);
    expect(cutoff.success).toBe(false);
    expect(!asOf.success && asOf.error.issues[0].path).toEqual(["asOfDate"]);
    expect(!cutoff.success && cutoff.error.issues[0].path).toEqual(["lateHireCutoff"]);
  });

  it("requires at least one covered type and non-negative numbers", () => {
    expect(rulesConfigSchema.safeParse(config({ coveredTypes: [] })).success).toBe(false);
    expect(rulesConfigSchema.safeParse(config({ minHours: -1 })).success).toBe(false);
    expect(rulesConfigSchema.safeParse(config({ budgetPhp: -5 })).success).toBe(false);
  });

  it("rejects impossible dates", () => {
    expect(rulesConfigSchema.safeParse(config({ asOfDate: "2026-02-30" })).success).toBe(false);
  });
});

describe("defaultRulesConfig", () => {
  it("follows spec §2.4 defaults and is itself valid", () => {
    const defaults = defaultRulesConfig("2026-09-30");
    expect(defaults).toEqual({
      year: 2026,
      asOfDate: "2026-09-30",
      lateHireCutoff: "2026-10-01",
      coveredTypes: ["regular", "contractual", "casual"],
      elearningCounts: true,
      minHours: 1,
      budgetPhp: 0,
    });
    expect(rulesConfigSchema.safeParse(defaults).success).toBe(true);
  });
});
