import { describe, expect, it } from "vitest";
import { finalizeMemo, finalizeRecommendations, formatDeadline, limitWords } from "@/lib/ai/finalize";
import type { MemoRequest, RecommendRequest } from "@/lib/schemas";

const recRequest: RecommendRequest = {
  units: [
    { unit: "Finance", atRiskLicensed: 3, atRiskUnlicensed: 1, topPositions: [] },
    { unit: "Legal", atRiskLicensed: 1, atRiskUnlicensed: 0, topPositions: ["Attorney"] },
    { unit: "HR", atRiskLicensed: 0, atRiskUnlicensed: 2, topPositions: [] },
  ],
  catalog: ["C1", "C2", "C3", "C4", "C5"].map((courseId) => ({
    courseId,
    title: courseId,
    skillArea: "General",
    durationMinutes: 60,
    provider: "in_house" as const,
  })),
};

describe("finalizeRecommendations (catalog-ID filtering)", () => {
  it("removes unknown course IDs and never returns them (acceptance 7)", () => {
    const out = finalizeRecommendations(
      { recommendations: [{ unit: "Finance", courseIds: ["C1", "HALLUCINATED", "C2"], rationale: "fits" }] },
      recRequest,
    );
    expect(out.recommendations[0]).toEqual({
      unit: "Finance",
      courseIds: ["C1", "C2"],
      rationale: "fits",
      fallbackSearch: false,
    });
    expect(JSON.stringify(out)).not.toContain("HALLUCINATED");
  });

  it("flags units left with no valid ID for the search fallback", () => {
    const out = finalizeRecommendations(
      { recommendations: [{ unit: "Legal", courseIds: ["NOPE"], rationale: "x" }] },
      recRequest,
    );
    expect(out.recommendations.find((r) => r.unit === "Legal")).toMatchObject({
      courseIds: [],
      fallbackSearch: true,
    });
  });

  it("returns an entry for every requested unit, including ones the model skipped", () => {
    const out = finalizeRecommendations({ recommendations: [] }, recRequest);
    expect(out.recommendations.map((r) => [r.unit, r.fallbackSearch])).toEqual([
      ["Finance", true],
      ["Legal", true],
      ["HR", true],
    ]);
  });

  it("drops units that were not requested and ignores duplicate unit entries", () => {
    const out = finalizeRecommendations(
      {
        recommendations: [
          { unit: "Invented Unit", courseIds: ["C1"], rationale: "x" },
          { unit: "HR", courseIds: ["C3"], rationale: "first" },
          { unit: "HR", courseIds: ["C4"], rationale: "second" },
        ],
      },
      recRequest,
    );
    expect(out.recommendations.map((r) => r.unit)).toEqual(["Finance", "Legal", "HR"]);
    expect(out.recommendations[2]).toMatchObject({ courseIds: ["C3"], rationale: "first" });
  });

  it("keeps at most 3 distinct IDs and truncates the rationale to 300 characters", () => {
    const out = finalizeRecommendations(
      {
        recommendations: [
          { unit: "Finance", courseIds: ["C1", "C1", "C2", "C3", "C4", "C5"], rationale: "r".repeat(500) },
        ],
      },
      recRequest,
    );
    expect(out.recommendations[0].courseIds).toEqual(["C1", "C2", "C3"]);
    expect(out.recommendations[0].rationale).toHaveLength(300);
  });
});

const memoRequest: MemoRequest = {
  unit: "Finance",
  atRiskCount: 12,
  coveredCount: 85,
  deadline: "2026-12-31",
  monthsRemaining: 3,
  courses: [],
  tone: "formal",
};
const countOf = (text: string, needle: string) => text.split(needle).length - 1;

describe("finalizeMemo (token enforcement)", () => {
  it("fills the fact tokens from the request, not from the model", () => {
    const memo = finalizeMemo(
      {
        subject: "{{AT_RISK_COUNT}} staff need training",
        body: "{{AT_RISK_COUNT}} of {{COVERED_COUNT}} staff must finish by {{DEADLINE}}.\n{{EMPLOYEE_LIST}}",
      },
      memoRequest,
    );
    expect(memo.subject).toBe("12 staff need training");
    expect(memo.body).toBe("12 of 85 staff must finish by December 31, 2026.\n{{EMPLOYEE_LIST}}");
  });

  it("prepends a fact sentence when a fact token is missing", () => {
    const memo = finalizeMemo({ subject: "Training", body: "Please act soon.\n{{EMPLOYEE_LIST}}" }, memoRequest);
    expect(memo.body.startsWith("Of 85 covered employees in Finance, 12 have no qualifying training yet.")).toBe(true);
    expect(memo.body).toContain("December 31, 2026");
  });

  it("appends {{EMPLOYEE_LIST}} when the model leaves it out", () => {
    const memo = finalizeMemo(
      { subject: "S", body: "{{AT_RISK_COUNT}} {{COVERED_COUNT}} {{DEADLINE}} done." },
      memoRequest,
    );
    expect(countOf(memo.body, "{{EMPLOYEE_LIST}}")).toBe(1);
    expect(memo.body.endsWith("{{EMPLOYEE_LIST}}")).toBe(true);
  });

  it("keeps exactly one {{EMPLOYEE_LIST}} and strips it from the subject", () => {
    const memo = finalizeMemo(
      {
        subject: "List {{EMPLOYEE_LIST}}",
        body: "{{AT_RISK_COUNT}} {{COVERED_COUNT}} {{DEADLINE}} A\n{{EMPLOYEE_LIST}}\nB\n{{EMPLOYEE_LIST}}",
      },
      memoRequest,
    );
    expect(countOf(memo.body, "{{EMPLOYEE_LIST}}")).toBe(1);
    expect(memo.body).toContain("A\n{{EMPLOYEE_LIST}}\nB\n");
    expect(memo.subject).toBe("List");
  });
});

describe("limitWords and formatDeadline", () => {
  it("leaves short text alone and trims long text at a sentence end", () => {
    expect(limitWords("One two three.", 250)).toBe("One two three.");
    const long = `${"Word ".repeat(40)}end. ${"More ".repeat(300)}`;
    const cut = limitWords(long, 50);
    expect(cut.split(/\s+/).length).toBeLessThanOrEqual(50);
  });

  it("formats deadlines without time zones", () => {
    expect(formatDeadline("2026-12-31")).toBe("December 31, 2026");
    expect(formatDeadline("2027-01-05")).toBe("January 5, 2027");
  });
});
