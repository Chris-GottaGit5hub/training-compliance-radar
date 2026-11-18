import { describe, expect, it } from "vitest";
import { filesKey, setupCollapsed, setupSummary, type SetupFiles } from "@/lib/analysis";
import { config } from "./helpers/fixtures";

const ok = (fileName: string, n: number) => ({ status: "ok" as const, fileName, rows: Array(n).fill({}), warnings: [] });
const empty = { status: "empty" as const };
const bad = { status: "error" as const, fileName: "roster.csv", errors: [], totalErrors: 1 };

const sampleFiles: SetupFiles = {
  roster: ok("roster.csv (sample)", 12_000),
  attendance: ok("attendance.csv (sample)", 15_965),
  catalog: ok("catalog.csv (sample)", 26),
  calendar: ok("calendar.csv (sample)", 48),
};

describe("setupSummary (spec §6, collapsed Data and Rules)", () => {
  it("summarizes the loaded files and the key rules in two lines", () => {
    const s = setupSummary(sampleFiles, config({ asOfDate: "2026-09-30", minHours: 1, budgetPhp: 100_000_000 }));
    expect(s.data).toBe("12,000 employees · 15,965 attendance rows · 26 courses · 48 calendar runs");
    expect(s.rules).toBe("As of 2026-09-30 · minimum 1 hour · e-learning counts · budget ₱100M");
  });

  it("leaves out optional files that are not loaded, uses singulars, and says when there is no budget", () => {
    const s = setupSummary(
      { roster: ok("r.csv", 1), attendance: ok("a.csv", 1), catalog: empty, calendar: empty },
      config({ minHours: 2.5, elearningCounts: false, budgetPhp: 0 }),
    );
    expect(s.data).toBe("1 employee · 1 attendance row");
    expect(s.rules).toContain("minimum 2.5 hours");
    expect(s.rules).toContain("e-learning does not count");
    expect(s.rules).toContain("no budget set");
  });

  it("shows a budget that is not a whole million with two decimals", () => {
    expect(setupSummary(sampleFiles, config({ budgetPhp: 2_450_000 })).rules).toContain("budget ₱2.45M");
  });
});

describe("filesKey", () => {
  it("changes when a different file is loaded, not when the same files stay", () => {
    const key = filesKey(sampleFiles);
    expect(filesKey({ ...sampleFiles })).toBe(key);
    expect(filesKey({ ...sampleFiles, calendar: empty })).not.toBe(key);
    expect(filesKey({ ...sampleFiles, roster: ok("my-roster.csv", 12_000) })).not.toBe(key);
  });
});

describe("setupCollapsed", () => {
  const base = { ready: true, hasResults: true, ruleErrors: 0, files: sampleFiles, sampleLoading: false, openedFor: null };

  it("collapses once everything is loaded, valid and analyzed", () => {
    expect(setupCollapsed(base)).toBe(true);
  });

  it("stays open while the user has opened it for these same files (so rule edits do not fold it)", () => {
    expect(setupCollapsed({ ...base, openedFor: filesKey(sampleFiles) })).toBe(false);
  });

  it("folds again when new files are loaded", () => {
    const opened = filesKey(sampleFiles);
    const newFiles = { ...sampleFiles, calendar: ok("my-calendar.csv", 10) };
    expect(setupCollapsed({ ...base, files: newFiles, openedFor: opened })).toBe(true);
  });

  it("opens on any file error, rule error, missing data, missing results, or while the sample loads", () => {
    expect(setupCollapsed({ ...base, files: { ...sampleFiles, catalog: bad } })).toBe(false);
    expect(setupCollapsed({ ...base, ruleErrors: 1 })).toBe(false);
    expect(setupCollapsed({ ...base, ready: false })).toBe(false);
    expect(setupCollapsed({ ...base, hasResults: false })).toBe(false);
    expect(setupCollapsed({ ...base, sampleLoading: true })).toBe(false);
  });
});
