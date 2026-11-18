import { describe, expect, it } from "vitest";
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
