import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { finalizeMemo } from "@/lib/ai/finalize";
import {
  atRiskEmployees,
  buildAtRiskCsv,
  initialConfigFor,
  runAnalysis,
  withAssignments,
  type AtRiskRow,
  type Plan,
} from "@/lib/analysis";
import { mergeEmployeeList } from "@/lib/payload";
import { validateCsv, type CatalogRow, type MemoRequest } from "@/lib/schemas";
import { config, course } from "./helpers/fixtures";

const person = (id: string, licensed: boolean, unit = "Finance", position = "Accountant"): AtRiskRow => ({
  employeeId: id, name: `Name ${id}`, unit, position, employmentType: "regular", licensed, hireDate: "2020-01-01",
});
const named = (id: string, title: string, provider: CatalogRow["provider"], cost: number, extra: Partial<CatalogRow> = {}): CatalogRow =>
  ({ ...course(id, provider, 120, cost), title, skill_area: "Finance", ...extra });
const emptyPlan = (assignments: Plan["assignments"]): Plan => ({
  runs: [], licensedLinkedIn: 0, paidLinkedIn: 0, unplaced: 0, runsCost: 0, linkedInCost: 0,
  totalPlannedCost: 0, plannedByMonth: Array(12).fill(0), milestones: [], assignments,
});

describe("withAssignments (spec §4.9 item 6)", () => {
  const catalog = [
    named("LL1", "Financial Literacy for Professionals", "linkedin_learning", 0),
    named("LL2", "Excel Essential Training", "linkedin_learning", 0, { skill_area: "Productivity" }),
    named("IH1", "Introduction to Government Accounting", "in_house", 900),
  ];

  it("without a plan: licensed staff get the unit's LinkedIn pick, others the unit's best course, by Nov 30", () => {
    const [a, b] = withAssignments([person("A", true), person("B", false)], { plan: null, catalog, config: config() });
    expect(a).toMatchObject({ recommendedCourse: "Financial Literacy for Professionals", completeBy: "2026-11-30" });
    expect(b.recommendedCourse).toBe("Introduction to Government Accounting"); // "accountant" ~ "accounting"
    expect(b.completeBy).toBe("2026-11-30");
  });

  it("prefers the first LinkedIn course the AI recommended for the unit", () => {
    const [a] = withAssignments([person("A", true)], {
      plan: null, catalog, config: config(), preferredCourseIds: (unit) => (unit === "Finance" ? ["IH1", "LL2"] : undefined),
    });
    expect(a.recommendedCourse).toBe("Excel Essential Training");
  });

  it("follows the plan: runs by their date, the window course by its end, paid marked, unplaced without a date", () => {
    const plan = emptyPlan(new Map([
      ["R", { route: "run" as const, title: "Risk and Control Self-Assessment", date: "2026-10-15" }],
      ["W", { route: "window" as const, title: "Anti-Money Laundering Foundations", date: "2026-10-31" }],
      ["L", { route: "linkedin" as const, date: "2026-11-30" }],
      ["P", { route: "paid" as const, date: "2026-11-30" }],
      ["U", { route: "unplaced" as const }],
    ]));
    const rows = withAssignments(["R", "W", "L", "P", "U"].map((id) => person(id, id === "W" || id === "L")), { plan, catalog, config: config() });
    expect(rows.map((r) => [r.recommendedCourse, r.completeBy])).toEqual([
      ["Risk and Control Self-Assessment", "2026-10-15"],
      ["Anti-Money Laundering Foundations", "2026-10-31"],
      ["Financial Literacy for Professionals", "2026-11-30"],
      ["Financial Literacy for Professionals (paid)", "2026-11-30"],
      ["No route yet", undefined],
    ]);
  });

  it("says there is no route when nothing qualifies", () => {
    const [a] = withAssignments([person("A", false)], { plan: null, catalog: [], config: config() });
    expect(a).toMatchObject({ recommendedCourse: "No route yet" });
    expect(a.completeBy).toBeUndefined();
  });
});

describe("plan assignments on the 12,000-employee sample", () => {
  const load = <K extends "roster" | "attendance" | "catalog" | "calendar">(kind: K) => {
    const r = validateCsv(kind, readFileSync(path.resolve(process.cwd(), "public/sample", `${kind}.csv`), "utf8"));
    if (!r.ok) throw new Error(kind);
    return r.rows;
  };
  const roster = load("roster");
  const catalog = load("catalog");
  const cfg = initialConfigFor("sample", roster, "2026-11-18");
  const analysis = runAnalysis({ roster, attendance: load("attendance"), catalog, calendar: load("calendar"), config: cfg });
  const plan = analysis.plan!;

  it("gives every at-risk employee exactly one route", () => {
    expect(plan.assignments.size).toBe(analysis.org.atRisk);
  });

  it("puts as many people in each held run as the run's participants", () => {
    for (const run of plan.runs.filter((r) => r.state === "held")) {
      const placed = [...plan.assignments.values()].filter((a) => a.route === "run" && a.date === run.date);
      expect(placed.length).toBeGreaterThanOrEqual(run.participants);
    }
    const inRuns = [...plan.assignments.values()].filter((a) => a.route === "run").length;
    expect(inRuns).toBe(plan.runs.reduce((sum, r) => sum + r.participants, 0));
  });

  it("gives everyone in Southern Luzon Branches a course, with dates on or before Nov 30", () => {
    const rows = withAssignments(atRiskEmployees(analysis.results, roster, "Southern Luzon Branches"), { plan, catalog, config: cfg });
    expect(rows).toHaveLength(88);
    for (const r of rows) {
      expect(r.recommendedCourse).toBeTruthy();
      expect(r.recommendedCourse).not.toBe("No route yet");
      expect(r.completeBy! <= "2026-11-30").toBe(true);
    }
  });
});

describe("memo, CSV and AI output with assignments", () => {
  const rows = [
    { ...person("A", true), recommendedCourse: "Excel Essential Training", completeBy: "2026-11-30" },
    { ...person("B", false), recommendedCourse: "No route yet" },
  ];

  it("ends each memo name line with the person's course and complete-by date", () => {
    expect(mergeEmployeeList("{{EMPLOYEE_LIST}}", rows)).toBe(
      "- Name A (Accountant) — Excel Essential Training, by November 30, 2026\n- Name B (Accountant) — No route yet",
    );
  });

  it("adds recommended_course and complete_by to the at-risk CSV", () => {
    const csv = buildAtRiskCsv(rows);
    expect(csv.split("\r\n")[0]).toBe(
      "﻿employee_id,personnel_number,name,unit,position,employment_type,licensed,hire_date,recommended_course,complete_by",
    );
    expect(csv.split("\r\n")[1].endsWith(",Excel Essential Training,2026-11-30")).toBe(true);
    expect(csv.split("\r\n")[2].endsWith(",No route yet,")).toBe(true);
  });

  it("rewrites a stray monthsRemaining field name in AI memos", () => {
    const request: MemoRequest = {
      unit: "Finance", atRiskCount: 2, coveredCount: 10, deadline: "2026-12-31", monthsRemaining: 3, courses: [], tone: "friendly",
    };
    const out = finalizeMemo({ subject: "s", body: "With only 3 monthsRemaining, act now.\n{{EMPLOYEE_LIST}}" }, request);
    expect(out.body).toContain("3 months remaining");
    expect(out.body).not.toContain("monthsRemaining");
  });
});
