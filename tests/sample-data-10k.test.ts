import { describe, expect, it } from "vitest";
import { evaluateRoster, summarizeOrg } from "@/lib/engine";
import { defaultRulesConfig, validateCsv } from "@/lib/schemas";
import { build10kDataset } from "@/scripts/sample-data-10k";
import { allocate } from "@/scripts/sample-data-10k/roster";

const YEAR = 2026;
const { personnel, files } = build10kDataset(YEAR);

describe("10k synthetic personnel set", () => {
  it("has exactly 10,000 people in 50 departments under the 7 sectors", () => {
    expect(personnel).toHaveLength(10_000);
    expect(new Set(personnel.map((p) => p.unit)).size).toBe(50);
    expect(new Set(personnel.map((p) => p.sector))).toEqual(
      new Set(["BBS", "CSS", "DBS", "EXEC", "OS", "NDLS", "TIBS"]),
    );
  });

  it("uses a unique 5-digit Personnel Number as the key and a unique 4-character employee number", () => {
    expect(new Set(personnel.map((p) => p.employee_id)).size).toBe(10_000);
    expect(personnel.every((p) => /^[1-9]\d{4}$/.test(p.employee_id))).toBe(true);
    expect(new Set(personnel.map((p) => p.employee_no)).size).toBe(10_000);
    expect(personnel.every((p) => /^[A-Z]\d{3}$/.test(p.employee_no))).toBe(true);
  });

  it("keeps pay grades within PG 4-18, with Customer Associate as the only PG 4 position", () => {
    const grades = personnel.map((p) => Number(p.pay_grade.replace("PG ", "")));
    expect(Math.min(...grades)).toBe(4);
    expect(Math.max(...grades)).toBe(18);
    const pg4 = new Set(personnel.filter((p) => p.pay_grade === "PG 4").map((p) => p.position));
    expect(pg4).toEqual(new Set(["Customer Associate"]));
    expect(personnel.some((p) => /driver/i.test(p.position))).toBe(false);
  });

  it("names each department's head from its own Department Manager", () => {
    for (const unit of new Set(personnel.map((p) => p.unit))) {
      const members = personnel.filter((p) => p.unit === unit);
      const managers = members.filter((p) => p.position === "Department Manager");
      expect(managers, unit).toHaveLength(1);
      expect(members.every((p) => p.department_head === managers[0].name)).toBe(true);
      expect(new Set(members.map((p) => p.department_email)).size).toBe(1);
    }
  });

  it("uses only the reserved .example email domain, with unique employee addresses", () => {
    expect(personnel.every((p) => p.employee_email.endsWith("@agency.example"))).toBe(true);
    expect(personnel.every((p) => p.department_email.endsWith("@agency.example"))).toBe(true);
    expect(new Set(personnel.map((p) => p.employee_email)).size).toBe(10_000);
  });

  it("marks exactly the people with a separation date as separated", () => {
    for (const p of personnel) {
      expect(p.employment_status).toBe(p.separation_date ? "separated" : "active");
    }
  });

  it("passes the app's own CSV validation within its row and size limits", () => {
    const roster = validateCsv("roster", files.roster);
    const attendance = validateCsv("attendance", files.attendance);
    expect(roster.ok && roster.rows).toHaveLength(10_000);
    expect(attendance.ok && attendance.rows.length).toBeLessThanOrEqual(20_000);
    expect(validateCsv("catalog", files.catalog).ok).toBe(true);
  });

  it("puts 15-25% of covered employees at risk on Sep 30, with no orphan or duplicate attendance", () => {
    const roster = validateCsv("roster", files.roster);
    const attendance = validateCsv("attendance", files.attendance);
    if (!roster.ok || !attendance.ok) throw new Error("invalid files");
    const config = defaultRulesConfig(`${YEAR}-09-30`);
    const { results, warnings } = evaluateRoster(roster.rows, attendance.rows, config);
    expect(warnings).toEqual({ orphanAttendanceRows: 0, duplicateAttendanceRows: 0 });
    const org = summarizeOrg(results, roster.rows, config);
    expect(org.atRisk / org.covered).toBeGreaterThanOrEqual(0.15);
    expect(org.atRisk / org.covered).toBeLessThanOrEqual(0.25);
  });

  it("is reproducible for the same seed", () => {
    expect(build10kDataset(YEAR).files.roster).toBe(files.roster);
  });
});

describe("allocate", () => {
  it("splits a total across weights so the parts add up exactly", () => {
    expect(allocate([1, 1, 1], 10).reduce((a, b) => a + b, 0)).toBe(10);
    expect(allocate([420, 410, 90, 100], 1_000).reduce((a, b) => a + b, 0)).toBe(1_000);
  });
});
