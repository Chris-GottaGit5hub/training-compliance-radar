import { describe, expect, it } from "vitest";
import { memoLayout, memoPlainText, type AtRiskRow } from "@/lib/analysis";
import type { CatalogRow } from "@/lib/schemas";
import { course } from "./helpers/fixtures";

const person = (name: string, position: string, recommendedCourse?: string, completeBy?: string): AtRiskRow => ({
  employeeId: name, name, unit: "Information Security", position, employmentType: "regular", licensed: true,
  hireDate: "2020-01-01", recommendedCourse, completeBy,
});
const cat = (id: string, title: string, minutes: number, url?: string): CatalogRow =>
  ({ ...course(id, "linkedin_learning", minutes, 0), title, ...(url ? { url } : {}) });

const catalog = [
  cat("AML", "Anti-Money Laundering Briefing", 90, "https://example.com/aml"),
  cat("PBI", "Power BI Essential Training", 160, "https://example.com/pbi"),
  cat("LAB", "Information Security Hands-on Lab", 300),
];
const body =
  "Dear Unit Head,\n\nFive members of the team have yet to complete their training.\nPlease see below:\n\n{{EMPLOYEE_LIST}}\n\nPlease ensure your team completes its requirements.\n\nSincerely,\nLearning and Development Office";
const rows = [
  person("Cristina R. Villanueva", "Systems Developer", "Anti-Money Laundering Briefing (paid)", "2026-11-30"),
  person("Gemma R. Dimaculangan", "Network Engineer", "Anti-Money Laundering Briefing", "2026-11-30"),
  person("Rodel S. Javier", "Network Engineer", "No route yet"),
];

describe("memoLayout (spec §6, v2.13)", () => {
  const layout = memoLayout(body, rows, catalog, [catalog[0], catalog[1], catalog[2]]);

  it("splits the body into paragraphs before and after the employee list", () => {
    expect(layout.intro).toEqual([
      "Dear Unit Head,",
      "Five members of the team have yet to complete their training.\nPlease see below:",
    ]);
    expect(layout.closing).toEqual([
      "Please ensure your team completes its requirements.",
      "Sincerely,\nLearning and Development Office",
    ]);
  });

  it("numbers the people and separates the paid mark and the deadline", () => {
    expect(layout.people).toEqual([
      { n: 1, name: "Cristina R. Villanueva", role: "Systems Developer", course: "Anti-Money Laundering Briefing", paid: true, deadline: "November 30, 2026" },
      { n: 2, name: "Gemma R. Dimaculangan", role: "Network Engineer", course: "Anti-Money Laundering Briefing", paid: false, deadline: "November 30, 2026" },
      { n: 3, name: "Rodel S. Javier", role: "Network Engineer", course: "No route yet", paid: false, deadline: "—" },
    ]);
  });

  it("lists assigned courses first, then the other recommended ones as optional alternatives", () => {
    expect(layout.courses).toEqual([
      { title: "Anti-Money Laundering Briefing", minutes: 90, url: "https://example.com/aml", optional: false },
      { title: "Power BI Essential Training", minutes: 160, url: "https://example.com/pbi", optional: true },
      { title: "Information Security Hands-on Lab", minutes: 300, url: undefined, optional: true },
    ]);
  });

  it("keeps an assigned calendar run that is not in the catalog, without duration or link", () => {
    const l = memoLayout("{{EMPLOYEE_LIST}}", [person("A", "Teller", "Procurement Law Refresher", "2026-11-12")], catalog, []);
    expect(l.courses).toEqual([{ title: "Procurement Law Refresher", minutes: undefined, url: undefined, optional: false }]);
  });

  it("puts the list at the end when the body has no token", () => {
    const l = memoLayout("Hello.\n\nBye.", rows, catalog, []);
    expect(l.intro).toEqual(["Hello.", "Bye."]);
    expect(l.closing).toEqual([]);
  });
});

describe("memoPlainText", () => {
  it("gives the same order as plain text, with numbered lines and Course Access", () => {
    const text = memoPlainText("Action Required", memoLayout(body, rows.slice(0, 2), catalog, [catalog[1]]));
    expect(text).toBe(
      [
        "Subject: Action Required",
        "",
        "Dear Unit Head,",
        "",
        "Five members of the team have yet to complete their training.\nPlease see below:",
        "",
        "1. Cristina R. Villanueva — Systems Developer — Anti-Money Laundering Briefing (paid) — November 30, 2026",
        "2. Gemma R. Dimaculangan — Network Engineer — Anti-Money Laundering Briefing — November 30, 2026",
        "",
        "Course Access:",
        "- Anti-Money Laundering Briefing (90 mins) – https://example.com/aml",
        "- Power BI Essential Training (160 mins) (optional alternative) – https://example.com/pbi",
        "",
        "Please ensure your team completes its requirements.",
        "",
        "Sincerely,\nLearning and Development Office",
      ].join("\n"),
    );
  });
});
