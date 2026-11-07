import { describe, expect, it } from "vitest";
import {
  configErrors,
  dataYear,
  formatPercent,
  formatPeso,
  formatRatio,
  initialConfigFor,
  isOversized,
  oversizedState,
  stateFromResult,
  withYear,
} from "@/lib/analysis";
import { CSV_LIMITS, validateCsv } from "@/lib/schemas";
import { ROSTER_HEADER, config, emp } from "./helpers/fixtures";

describe("dataYear and initialConfigFor", () => {
  const roster = [emp("A", { hire_date: "2019-05-01" }), emp("B", { hire_date: "2026-10-12" })];

  it("uses the year of the latest hire date", () => {
    expect(dataYear(roster)).toBe(2026);
    expect(dataYear([])).toBeNull();
  });

  it("starts sample data as of Sep 30 of the data year", () => {
    expect(initialConfigFor("sample", roster, "2027-03-15")).toMatchObject({
      year: 2026,
      asOfDate: "2026-09-30",
      lateHireCutoff: "2026-10-01",
    });
  });

  it("starts uploaded data as of today", () => {
    expect(initialConfigFor("upload", roster, "2027-03-15")).toMatchObject({
      year: 2027,
      asOfDate: "2027-03-15",
      lateHireCutoff: "2027-10-01",
    });
  });

  it("falls back to today for an empty sample roster", () => {
    expect(initialConfigFor("sample", [], "2027-03-15").asOfDate).toBe("2027-03-15");
  });
});

describe("withYear", () => {
  it("moves the dates into the new year, keeping month and day", () => {
    expect(withYear(config(), 2025)).toMatchObject({
      year: 2025,
      asOfDate: "2025-09-30",
      lateHireCutoff: "2025-10-01",
    });
  });

  it("maps Feb 29 to Feb 28 in a non-leap year", () => {
    const leap = config({ year: 2024, asOfDate: "2024-02-29", lateHireCutoff: "2024-10-01" });
    expect(withYear(leap, 2025).asOfDate).toBe("2025-02-28");
    expect(withYear(leap, 2028).asOfDate).toBe("2028-02-29");
  });

  it("only sets the year while the field is blank (NaN)", () => {
    const blank = withYear(config(), Number.NaN);
    expect(blank.year).toBeNaN();
    expect(blank.asOfDate).toBe("2026-09-30");
  });
});

describe("configErrors", () => {
  it("is empty for a valid config", () => {
    expect(configErrors(config())).toEqual({});
  });

  it("reports the field and message for each problem", () => {
    const errors = configErrors(config({ coveredTypes: [], minHours: Number.NaN }));
    expect(errors.coveredTypes).toBe("pick at least one type");
    expect(errors.minHours).toBe("Enter a number");
  });

  it("reports dates outside the year (checked once the other fields are valid)", () => {
    expect(configErrors(config({ asOfDate: "2027-01-02" })).asOfDate).toBe("must fall within 2026");
    expect(configErrors(config({ lateHireCutoff: "2025-10-01" })).lateHireCutoff).toBe(
      "must fall within 2026",
    );
  });
});

describe("file state", () => {
  it("keeps rows and warnings from a valid file", () => {
    const text = `${ROSTER_HEADER}\nE1,Ana,IT,Dev,regular,2020-01-05,,yes\n`;
    const state = stateFromResult(validateCsv("roster", text), "roster.csv");
    expect(state).toMatchObject({ status: "ok", fileName: "roster.csv", warnings: [] });
    expect(state.status === "ok" && state.rows).toHaveLength(1);
  });

  it("keeps row-numbered errors from an invalid file", () => {
    const text = `${ROSTER_HEADER}\nE1,Ana,IT,Dev,regular,2020-13-45,,yes\n`;
    const state = stateFromResult(validateCsv("roster", text), "bad.csv");
    expect(state).toMatchObject({ status: "error", fileName: "bad.csv", totalErrors: 1 });
    expect(state.status === "error" && state.errors[0].row).toBe(2);
  });

  it("flags files over 5 MB before reading them", () => {
    expect(isOversized(CSV_LIMITS.maxBytes)).toBe(false);
    expect(isOversized(CSV_LIMITS.maxBytes + 1)).toBe(true);
    expect(oversizedState("big.csv")).toMatchObject({ status: "error", fileName: "big.csv" });
  });
});

describe("format helpers", () => {
  it("formats pesos without decimals", () => {
    expect(formatPeso(1200)).toContain("1,200");
    expect(formatPeso(1200)).toContain("₱");
    expect(formatPeso(0)).toContain("0");
  });

  it("formats engine percents with one decimal", () => {
    expect(formatPercent(81.9)).toBe("81.9%");
    expect(formatPercent(100)).toBe("100.0%");
  });

  it("formats 0-1 ratios as whole percents and null as a dash", () => {
    expect(formatRatio(0.5714)).toBe("57%");
    expect(formatRatio(1)).toBe("100%");
    expect(formatRatio(null)).toBe("—");
  });
});
