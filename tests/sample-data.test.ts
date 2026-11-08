import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backtest, evaluateRoster, summarizeOrg } from "@/lib/engine";
import { defaultRulesConfig, validateCsv } from "@/lib/schemas";
import { buildSampleDataset } from "@/scripts/sample-data/dataset";
import { allocate, employeeIdFor } from "@/scripts/sample-data/roster";

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

  it("have 12,000 employees in 50 departments under 7 sectors, with a 26-course catalog", () => {
    expect(roster).toHaveLength(12_000);
    expect(new Set(roster.map((r) => r.unit)).size).toBe(50);
    expect(new Set(roster.map((r) => r.sector))).toEqual(
      new Set(["BBS", "CSS", "DBS", "EXEC", "OS", "NDLS", "TIBS"]),
    );
    expect(catalog).toHaveLength(26);
    expect(attendance.length).toBeLessThanOrEqual(20_000);
  });

  it("number Employee IDs A100 to A999, then B100 onwards, and Personnel Numbers uniquely in 5 digits", () => {
    expect(roster[0].employee_id).toBe("A100");
    expect(roster[899].employee_id).toBe("A999");
    expect(roster[900].employee_id).toBe("B100");
    expect(roster[11_999].employee_id).toBe("N399");
    expect(roster.every((r) => /^[A-Z]\d{3}$/.test(r.employee_id))).toBe(true);
    expect(new Set(roster.map((r) => r.employee_id)).size).toBe(12_000);
    expect(roster.every((r) => /^[1-9]\d{4}$/.test(r.personnel_number ?? ""))).toBe(true);
    expect(new Set(roster.map((r) => r.personnel_number)).size).toBe(12_000);
  });

  it("follows the pay-grade ladder: PG 4-13 staff, group heads PG 14, sector heads PG 16, one President at PG 18", () => {
    const grades = roster.map((r) => r.pay_grade ?? 0);
    expect(Math.min(...grades)).toBe(4);
    expect(Math.max(...grades)).toBe(18);
    const at = (pg: number) => roster.filter((r) => r.pay_grade === pg);
    expect(at(18).map((r) => r.position)).toEqual(["President"]);
    expect(at(16).map((r) => r.position)).toEqual(Array(7).fill("Sector Head"));
    expect(at(14).map((r) => r.position)).toEqual(Array(14).fill("Group Head"));
    expect(at(15)).toHaveLength(0);
    expect(at(17)).toHaveLength(0);
    // Every department has a head at PG 12 or above.
    for (const unit of new Set(roster.map((r) => r.unit))) {
      const head = roster.filter((r) => r.unit === unit && r.position === "Department Manager");
      expect(head, unit).toHaveLength(1);
      expect(head[0].pay_grade).toBeGreaterThanOrEqual(12);
    }
  });

  it("mix employment types, ~70% licensed, hires, separations and late hires", () => {
    expect(new Set(roster.map((r) => r.employment_type))).toEqual(
      new Set(["regular", "contractual"]),
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

describe("generator", () => {
  it("is reproducible and keeps the attendance linked to the roster by Employee ID", () => {
    const a = buildSampleDataset(year);
    expect(a.files.roster).toBe(buildSampleDataset(year).files.roster);
    const ids = new Set(a.personnel.map((p) => p.employee_id));
    expect(a.attendance.every((r) => ids.has(r.employee_id))).toBe(true);
    expect(employeeIdFor(899)).toBe("A999");
    expect(employeeIdFor(900)).toBe("B100");
    expect(() => employeeIdFor(23_400)).toThrow(RangeError);
  });

  it("names each department's head from its own Department Manager and uses only the .example domain", () => {
    const { personnel } = buildSampleDataset(year);
    for (const unit of new Set(personnel.map((p) => p.unit))) {
      const members = personnel.filter((p) => p.unit === unit);
      const manager = members.find((p) => p.position === "Department Manager");
      expect(members.every((p) => p.department_head === manager?.name)).toBe(true);
    }
    expect(personnel.every((p) => p.employee_email.endsWith("@agency.example"))).toBe(true);
    expect(new Set(personnel.map((p) => p.employee_email)).size).toBe(12_000);
  });

  it("marks exactly the people with a separation date as separated", () => {
    for (const p of buildSampleDataset(year).personnel) {
      expect(p.employment_status).toBe(p.separation_date ? "separated" : "active");
    }
  });

  it("splits the allocation of people across weights exactly", () => {
    expect(allocate([1, 1, 1], 10).reduce((a, b) => a + b, 0)).toBe(10);
    expect(allocate([420, 410, 90, 100], 12_000).reduce((a, b) => a + b, 0)).toBe(12_000);
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
