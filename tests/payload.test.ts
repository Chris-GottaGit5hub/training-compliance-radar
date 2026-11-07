import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atRiskEmployees, runAnalysis, type AtRiskRow } from "@/lib/analysis";
import {
  buildMemoPayload,
  buildRecommendPayload,
  buildSummaryPayload,
  mergeEmployeeList,
  recommendableCourses,
  topPositions,
  unitKey,
} from "@/lib/payload";
import {
  defaultRulesConfig,
  memoRequestSchema,
  recommendRequestSchema,
  summaryRequestSchema,
  validateCsv,
} from "@/lib/schemas";
import { config, course } from "./helpers/fixtures";
import type { UnitSummary } from "@/lib/engine";

const risk = (id: string, unit: string, position: string, name = `Person ${id}`): AtRiskRow => ({
  employeeId: id,
  name,
  unit,
  position,
  employmentType: "regular",
  licensed: true,
  hireDate: "2020-01-01",
});

const unit = (name: string, atRisk: number, covered = 20): UnitSummary => ({
  unit: name,
  covered,
  compliant: covered - atRisk,
  atRisk,
  atRiskLicensed: atRisk - 1 < 0 ? 0 : atRisk - 1,
  atRiskUnlicensed: atRisk > 0 ? 1 : 0,
  complianceRate: 50,
});

describe("topPositions (small-cell suppression)", () => {
  const rows = [
    ...["a", "b", "c", "d"].map((i) => risk(i, "Finance", "Teller")),
    ...["e", "f", "g"].map((i) => risk(i, "Finance", "Accountant")),
    ...["h", "i"].map((i) => risk(i, "Finance", "Auditor")), // only 2: suppressed
    risk("j", "Finance", "CFO"), // only 1: suppressed
    ...["k", "l", "m"].map((i) => risk(i, "Legal", "Attorney")),
  ];

  it("keeps only positions held by 3+ at-risk employees in that unit, most common first", () => {
    expect(topPositions(rows, "Finance")).toEqual(["Teller", "Accountant"]);
    expect(topPositions(rows, "Legal")).toEqual(["Attorney"]);
  });

  it("returns nothing when every position is a small cell", () => {
    expect(topPositions([risk("a", "X", "P"), risk("b", "X", "P")], "X")).toEqual([]);
  });

  it("returns at most 5 positions", () => {
    const many = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].flatMap((p) =>
      ["1", "2", "3"].map((n) => risk(`${p}${n}`, "U", p)),
    );
    expect(topPositions(many, "U")).toHaveLength(5);
  });
});

describe("buildRecommendPayload", () => {
  const catalog = [
    course("LL-1", "linkedin_learning", 90, 0),
    course("LL-short", "linkedin_learning", 30, 0),
    course("IH-1", "in_house", 120, 500),
  ];
  const units = [unit("Finance", 4), unit("Legal", 0), unit("HR", 2)];

  it("includes only at-risk units and qualifying courses, with catalog fields only", () => {
    const payload = buildRecommendPayload(units, [], catalog, config());
    expect(payload?.units.map((u) => u.unit)).toEqual(["Finance", "HR"]);
    expect(payload?.catalog.map((c) => c.courseId)).toEqual(["LL-1", "IH-1"]);
    expect(Object.keys(payload!.catalog[0]).sort()).toEqual(
      ["courseId", "durationMinutes", "provider", "skillArea", "title"].sort(),
    );
    expect(recommendRequestSchema.safeParse(payload).success).toBe(true);
  });

  it("drops LinkedIn Learning courses when e-learning does not count", () => {
    const courses = recommendableCourses(catalog, config({ elearningCounts: false }));
    expect(courses.map((c) => c.course_id)).toEqual(["IH-1"]);
  });

  it("returns null when there is nothing to ask", () => {
    expect(buildRecommendPayload([unit("Legal", 0)], [], catalog, config())).toBeNull();
    expect(buildRecommendPayload(units, [], [], config())).toBeNull();
  });

  it("truncates unit names to the API cap consistently", () => {
    const long = "U".repeat(150);
    const payload = buildRecommendPayload([unit(long, 1)], [], catalog, config());
    expect(payload?.units[0].unit).toBe(unitKey(long));
    expect(payload?.units[0].unit).toHaveLength(100);
  });
});

describe("buildMemoPayload and buildSummaryPayload", () => {
  it("builds a memo payload from counts, deadline and course titles only", () => {
    const withUrl = { ...course("LL-1", "linkedin_learning", 90, 0), url: "https://example.com/c" };
    const payload = buildMemoPayload(unit("Finance", 4, 20), [withUrl], config(), "formal");
    expect(payload).toEqual({
      unit: "Finance",
      atRiskCount: 4,
      coveredCount: 20,
      deadline: "2026-12-31",
      monthsRemaining: 3,
      courses: [{ title: "LL-1", url: "https://example.com/c", durationMinutes: 90 }],
      tone: "formal",
    });
    expect(memoRequestSchema.safeParse(payload).success).toBe(true);
  });

  it("builds a summary payload with the top 10 units, cost and budget when present", () => {
    const org = {
      covered: 100, compliant: 80, atRisk: 20, exempt: 1, excluded: 2, notCovered: 3,
      complianceRate: 80, monthsRemaining: 3, deadline: "2026-12-31",
      unitsRanked: Array.from({ length: 12 }, (_, i) => unit(`Unit ${i}`, 12 - i)),
    };
    const payload = buildSummaryPayload(
      org,
      { costToClose: 700, unpricedCount: 0, remaining: 300, covered: true },
      config({ budgetPhp: 1000 }),
    );
    expect(payload.topUnits).toHaveLength(10);
    expect(payload).toMatchObject({ costToClose: 700, budgetPhp: 1000, asOfDate: "2026-09-30" });
    expect(summaryRequestSchema.safeParse(payload).success).toBe(true);
    const bare = buildSummaryPayload(org, null, config());
    expect(bare).not.toHaveProperty("costToClose");
    expect(bare).not.toHaveProperty("budgetPhp");
  });
});

describe("request schemas reject anything beyond aggregates", () => {
  it("rejects extra fields such as names or IDs", () => {
    const memo = buildMemoPayload(unit("Finance", 4), [], config(), "formal");
    expect(memoRequestSchema.safeParse({ ...memo, employeeNames: ["Ana Cruz"] }).success).toBe(false);
    const summary = buildSummaryPayload(
      { covered: 1, compliant: 1, atRisk: 0, exempt: 0, excluded: 0, notCovered: 0, complianceRate: 100, monthsRemaining: 3, deadline: "2026-12-31", unitsRanked: [] },
      null,
      config(),
    );
    expect(summaryRequestSchema.safeParse({ ...summary, employeeIds: ["E1"] }).success).toBe(false);
    const rec = buildRecommendPayload([unit("Finance", 4)], [], [course("C", "in_house", 90, 1)], config())!;
    const withName = { ...rec, units: [{ ...rec.units[0], name: "Ana Cruz" }] };
    expect(recommendRequestSchema.safeParse(withName).success).toBe(false);
  });
});

describe("mergeEmployeeList (client-side name merge)", () => {
  const rows = [
    { name: "Ana Cruz", position: "Teller" },
    { name: "Ben Reyes", position: "Clerk" },
  ];

  it("replaces the token with the names", () => {
    expect(mergeEmployeeList("Please act:\n{{EMPLOYEE_LIST}}\nThanks", rows)).toBe(
      "Please act:\n- Ana Cruz (Teller)\n- Ben Reyes (Clerk)\nThanks",
    );
  });

  it("handles an empty unit and names containing $ patterns", () => {
    expect(mergeEmployeeList("x {{EMPLOYEE_LIST}}", [])).toBe("x (no at-risk employees)");
    expect(mergeEmployeeList("{{EMPLOYEE_LIST}}", [{ name: "A $& B", position: "P" }])).toBe(
      "- A $& B (P)",
    );
  });
});

describe("privacy: payloads built from the sample data contain no names or IDs", () => {
  const read = <K extends "roster" | "attendance" | "catalog">(kind: K) => {
    const text = readFileSync(path.resolve(process.cwd(), "public/sample", `${kind}.csv`), "utf8");
    const result = validateCsv(kind, text);
    if (!result.ok) throw new Error(`${kind}.csv invalid`);
    return result.rows;
  };
  const roster = read("roster");
  const attendance = read("attendance");
  const catalog = read("catalog");
  const cfg = defaultRulesConfig("2026-09-30");
  const analysis = runAnalysis({ roster, attendance, catalog, config: cfg });
  const atRisk = atRiskEmployees(analysis.results, roster);

  const payloads = JSON.stringify([
    buildRecommendPayload(analysis.org.unitsRanked, atRisk, catalog, cfg),
    ...analysis.org.unitsRanked.map((u) => buildMemoPayload(u, catalog.slice(0, 3), cfg, "friendly")),
    buildSummaryPayload(analysis.org, analysis.cost, cfg),
  ]);

  it("has no employee name or employee_id anywhere in the serialized payloads", () => {
    expect(atRisk.length).toBeGreaterThan(0);
    for (const emp of roster) {
      expect(payloads).not.toContain(emp.name);
      expect(payloads).not.toContain(emp.employee_id);
    }
    expect(payloads).not.toMatch(/EMP-\d/);
  });

  it("produces payloads that pass the server schemas", () => {
    const rec = buildRecommendPayload(analysis.org.unitsRanked, atRisk, catalog, cfg);
    expect(recommendRequestSchema.safeParse(rec).success).toBe(true);
    for (const u of analysis.org.unitsRanked) {
      expect(memoRequestSchema.safeParse(buildMemoPayload(u, [], cfg, "formal")).success).toBe(true);
    }
    expect(summaryRequestSchema.safeParse(buildSummaryPayload(analysis.org, analysis.cost, cfg)).success).toBe(true);
  });
});
