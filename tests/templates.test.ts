import { describe, expect, it } from "vitest";
import { buildTemplateMemo, buildTemplateSummary, runAnalysis } from "@/lib/analysis";
import { mergeEmployeeList } from "@/lib/payload";
import { att, config, course, emp, unitSummary } from "./helpers/fixtures";

const unit = (name: string, compliant: number, atRisk: number) => unitSummary(name, compliant, atRisk);
const countOf = (text: string, needle: string) => text.split(needle).length - 1;

describe("buildTemplateMemo", () => {
  const cfg = config(); // 2026, as of Sep 30 -> 3 months left

  it("writes a formal memo with the real counts, deadline and one employee-list token", () => {
    const memo = buildTemplateMemo(unit("Finance", 8, 12), [], cfg, "formal");
    expect(memo.subject).toBe("Action needed: 12 employees in Finance have no qualifying training yet");
    expect(memo.body).toContain("12 of 20 covered employees in Finance have not yet completed");
    expect(memo.body).toContain("December 31, 2026, about 3 months away");
    expect(countOf(memo.body, "{{EMPLOYEE_LIST}}")).toBe(1);
  });

  it("writes a friendlier version for the friendly tone", () => {
    const memo = buildTemplateMemo(unit("Finance", 8, 12), [], cfg, "friendly");
    expect(memo.subject).toContain("Friendly reminder");
    expect(memo.body.startsWith("Hello,")).toBe(true);
    expect(countOf(memo.body, "{{EMPLOYEE_LIST}}")).toBe(1);
  });

  it("uses singular wording for one employee and one month", () => {
    const memo = buildTemplateMemo(unit("Legal", 4, 1), [], config({ asOfDate: "2026-11-30" }), "formal");
    expect(memo.subject).toBe("Action needed: 1 employee in Legal has no qualifying training yet");
    expect(memo.body).toContain("1 of 5 covered employees in Legal has not yet completed");
    expect(memo.body).toContain("about 1 month away");
  });

  it("lists suggested courses with duration and link when given", () => {
    const withLink = { ...course("LL-1", "linkedin_learning", 90, 0), url: "https://example.com/c", title: "Excel Basics" };
    const memo = buildTemplateMemo(unit("Finance", 8, 12), [withLink, course("IH-1", "in_house", 120, 500)], cfg, "formal");
    expect(memo.body).toContain("Suggested courses:\n- Excel Basics (90 min) - https://example.com/c\n- IH-1 (120 min)");
  });

  it("never contains employee names, and merges names locally like an AI memo", () => {
    const memo = buildTemplateMemo(unit("Finance", 8, 12), [], cfg, "formal");
    const merged = mergeEmployeeList(memo.body, [{ name: "Ana Cruz", position: "Teller" }]);
    expect(memo.body).not.toContain("Ana Cruz");
    expect(merged).toContain("- Ana Cruz (Teller)");
    expect(merged).not.toContain("{{EMPLOYEE_LIST}}");
  });
});

describe("buildTemplateSummary", () => {
  const roster = [
    emp("A1", { unit: "Alpha" }), // compliant
    emp("A2", { unit: "Alpha", licensed: "no" }), // at risk (unlicensed: priced on the in-house route)
    emp("A3", { unit: "Alpha", licensed: "no" }), // at risk
    emp("B1", { unit: "Beta", licensed: "no" }), // at risk
    emp("B2", { unit: "Beta", separation_date: "2026-01-31" }), // excluded
  ];
  const attendance = [att("A1", "2026-03-01")];
  const catalog = [course("IH-1", "in_house", 120, 700)];
  const run = (cfg = config(), cat: typeof catalog | null = catalog) =>
    runAnalysis({ roster, attendance, catalog: cat, config: cfg });

  it("states the engine's numbers, top units and time left", () => {
    const text = buildTemplateSummary(run(), config());
    expect(text).toContain("As of 2026-09-30, 1 of 4 covered employees (25.0%) are compliant and 3 are at risk.");
    expect(text).toContain("0 exempt, 1 excluded and 0 not covered.");
    expect(text).toContain("The units with the most at-risk employees are Alpha (2) and Beta (1).");
    expect(text).toContain("There are 3 months left until the December 31, 2026 deadline.");
  });

  it("compares the cost with the budget when one is set", () => {
    const cfg = config({ budgetPhp: 5000 });
    expect(buildTemplateSummary(run(cfg), cfg)).toContain(
      "would cost ₱2,100, which the ₱5,000 budget covers with ₱2,900 to spare.",
    );
    const tight = config({ budgetPhp: 1000 });
    expect(buildTemplateSummary(run(tight), tight)).toContain("which is ₱1,100 more than the ₱1,000 budget.");
  });

  it("omits cost without a catalog, and flags a lower bound when courses are missing", () => {
    expect(buildTemplateSummary(run(config(), null), config())).not.toContain("cost");
    const short = config({ minHours: 5 }); // the only course is 2 h, so nothing qualifies
    expect(buildTemplateSummary(run(short), short)).toContain("This is a lower bound");
  });

  it("says so when nobody is at risk", () => {
    const allDone = runAnalysis({
      roster: [emp("A1")],
      attendance: [att("A1", "2026-03-01")],
      catalog: null,
      config: config(),
    });
    const text = buildTemplateSummary(allDone, config());
    expect(text).toContain("No unit has at-risk employees.");
    expect(text).toContain("keep monitoring");
  });
});
