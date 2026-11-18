import { describe, expect, it } from "vitest";
import { finalizeMemo } from "@/lib/ai/finalize";
import { MEMO_INSTRUCTIONS, SUMMARY_INSTRUCTIONS } from "@/lib/ai/prompts";

describe("AI instructions (spec §5)", () => {
  it("tell the memo writer that the covered count includes the untrained, never the completed", () => {
    expect(MEMO_INSTRUCTIONS).toContain("{{COVERED_COUNT}} is the total number of employees the rule applies to");
    expect(MEMO_INSTRUCTIONS).toContain("it is never the number who have completed");
    expect(MEMO_INSTRUCTIONS).toContain("{{AT_RISK_COUNT}} of {{COVERED_COUNT}} covered employees");
  });

  it("do not invite field names or a course list into the memo", () => {
    expect(MEMO_INSTRUCTIONS).toContain("Do not list the courses or links");
    expect(MEMO_INSTRUCTIONS).not.toMatch(/may mention monthsRemaining/);
  });

  it("ask the summary writer for a percent sign on rates", () => {
    expect(SUMMARY_INSTRUCTIONS).toContain("Write rates with a percent sign");
  });
});

describe("months-remaining token and unit ranking (spec v2.17)", () => {
  const request = {
    unit: "Southern Luzon Branches", atRiskCount: 88, coveredCount: 358, deadline: "2026-12-31",
    monthsRemaining: 3, courses: [], tone: "formal" as const,
  };
  const body = (text: string) =>
    finalizeMemo({ subject: "s", body: `{{AT_RISK_COUNT}} of {{COVERED_COUNT}} by {{DEADLINE}}. ${text}\n{{EMPLOYEE_LIST}}` }, request).body;

  it("fills {{MONTHS_REMAINING}} and its common variants with the number", () => {
    for (const token of ["{{MONTHS_REMAINING}}", "{{monthsRemaining}}", "{{months remaining}}", "{{ months_remaining }}"]) {
      expect(body(`With ${token} months left.`), token).toContain("With 3 months left.");
    }
  });

  it("tells the memo writer to use the token and the summary writer to keep the ranking order", () => {
    expect(MEMO_INSTRUCTIONS).toContain("{{MONTHS_REMAINING}}");
    expect(SUMMARY_INSTRUCTIONS).toContain("topUnits is already ranked by risk");
  });
});
