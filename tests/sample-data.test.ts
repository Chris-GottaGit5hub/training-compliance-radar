import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backtest, evaluateRoster, summarizeOrg } from "@/lib/engine";
import { defaultRulesConfig, validateCsv } from "@/lib/schemas";

function load<K extends "roster" | "attendance" | "catalog">(kind: K) {
  const text = readFileSync(path.resolve(process.cwd(), "public/sample", `${kind}.csv`), "utf8");
  const result = validateCsv(kind, text);
  if (!result.ok) throw new Error(`${kind}.csv invalid: ${JSON.stringify(result.errors)}`);
  return result.rows;
}

const roster = load("roster");
const attendance = load("attendance");
const catalog = load("catalog");
// Late hires exist in the data year, so the latest hire date identifies it.
const year = Number(roster.reduce((max, r) => (r.hire_date > max ? r.hire_date : max), "").slice(0, 4));
const sep30 = defaultRulesConfig(`${year}-09-30`);

describe("sample data files", () => {
  it("pass the app's own CSV validation with no warnings about orphans", () => {
    expect(evaluateRoster(roster, attendance, sep30).warnings).toEqual({
      orphanAttendanceRows: 0,
      duplicateAttendanceRows: 0,
    });
  });

  it("have ~300 employees across ~12 units and ~25 courses", () => {
    expect(roster).toHaveLength(300);
    expect(new Set(roster.map((r) => r.unit)).size).toBe(12);
    expect(catalog.length).toBeGreaterThanOrEqual(24);
    expect(catalog.length).toBeLessThanOrEqual(27);
  });

  it("mix employment types, ~70% licensed, hires, separations and late hires", () => {
    expect(new Set(roster.map((r) => r.employment_type))).toEqual(
      new Set(["regular", "contractual", "casual"]),
    );
    const licensed = roster.filter((r) => r.licensed === "yes").length / roster.length;
    expect(licensed).toBeGreaterThan(0.6);
    expect(licensed).toBeLessThan(0.8);
    expect(roster.some((r) => r.hire_date >= `${year}-01-01` && r.hire_date < `${year}-10-01`)).toBe(true);
    expect(roster.some((r) => r.hire_date >= `${year}-10-01`)).toBe(true);
    expect(roster.some((r) => r.separation_date !== undefined)).toBe(true);
  });

  it("have free LinkedIn Learning courses with search urls and costed in-house courses", () => {
    const linkedin = catalog.filter((c) => c.provider === "linkedin_learning");
    const inHouse = catalog.filter((c) => c.provider === "in_house");
    expect(linkedin.length).toBeGreaterThan(10);
    expect(inHouse.length).toBeGreaterThan(5);
    for (const c of linkedin) {
      expect(c.cost_per_head).toBe(0);
      expect(c.url).toMatch(/^https:\/\/www\.linkedin\.com\/learning\/search\?keywords=/);
    }
    for (const c of inHouse) expect(c.cost_per_head).toBeGreaterThan(0);
  });
});

describe("sample data through the engine", () => {
  const { results } = evaluateRoster(roster, attendance, sep30);
  const org = summarizeOrg(results, roster, sep30);

  it("puts 15-25% of covered employees at risk as of Sep 30", () => {
    const share = org.atRisk / org.covered;
    expect(share).toBeGreaterThanOrEqual(0.15);
    expect(share).toBeLessThanOrEqual(0.25);
  });

  it("produces excluded and not-covered employees at Sep 30, and exempt ones later", () => {
    expect(org.excluded).toBeGreaterThan(0);
    expect(org.notCovered).toBeGreaterThan(0);
    const nov = evaluateRoster(roster, attendance, { ...sep30, asOfDate: `${year}-11-30` });
    expect(summarizeOrg(nov.results, roster, { ...sep30, asOfDate: `${year}-11-30` }).exempt).toBeGreaterThan(0);
  });

  it("ranks units by at-risk count descending (acceptance 1)", () => {
    const atRisk = org.unitsRanked.map((u) => u.atRisk);
    expect(atRisk).toEqual([...atRisk].sort((a, b) => b - a));
    expect(org.unitsRanked.reduce((sum, u) => sum + u.atRisk, 0)).toBe(org.atRisk);
  });

  it("gives a meaningful back-test: some flagged staff close the gap in Q4", () => {
    const bt = backtest(roster, attendance, sep30, `${year}-09-30`);
    expect(bt.flaggedAtCheckpoint).toBe(org.atRisk);
    expect(bt.nonCompliantAtYearEnd).toBeGreaterThan(0);
    expect(bt.nonCompliantAtYearEnd).toBeLessThan(bt.flaggedAtCheckpoint);
    expect(bt.recall).toBeGreaterThanOrEqual(0.8);
    expect(bt.precision).toBeGreaterThan(0.3);
    expect(bt.precision).toBeLessThan(1);
  });
});
