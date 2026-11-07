import { describe, expect, it } from "vitest";
import {
  DuplicateEmployeeIdError,
  evaluateEmployee,
  evaluateRoster,
} from "@/lib/engine";
import { att, config, emp } from "./helpers/fixtures";

const statusOf = (
  e: ReturnType<typeof emp>,
  rows: ReturnType<typeof att>[] = [],
  c = config(),
) => evaluateEmployee(e, rows, c).status;

describe("rule 1: not yet hired", () => {
  it("is NOT_COVERED when hire_date is after asOfDate", () => {
    const r = evaluateEmployee(emp("E1", { hire_date: "2026-10-01" }), [], config());
    expect(r.status).toBe("NOT_COVERED");
    expect(r.reason).toBe("Not yet hired as of date");
  });

  it("covers an employee hired exactly on asOfDate", () => {
    expect(statusOf(emp("E1", { hire_date: "2026-09-30" }))).toBe("AT_RISK");
  });
});

describe("rule 2: separated", () => {
  it("is EXCLUDED when separated Mar 31 and asOf is Sep 30 (acceptance 3)", () => {
    expect(statusOf(emp("E1", { separation_date: "2026-03-31" }))).toBe("EXCLUDED");
  });

  it("is EXCLUDED when separated on asOfDate itself", () => {
    expect(statusOf(emp("E1", { separation_date: "2026-09-30" }))).toBe("EXCLUDED");
  });

  it("stays covered when separation is after asOfDate", () => {
    expect(statusOf(emp("E1", { separation_date: "2026-10-31" }))).toBe("AT_RISK");
  });
});

describe("rule 3: employment type", () => {
  it("is NOT_COVERED when the type is not in coveredTypes", () => {
    const c = config({ coveredTypes: ["regular"] });
    const r = evaluateEmployee(emp("E1", { employment_type: "casual" }), [], c);
    expect(r.status).toBe("NOT_COVERED");
    expect(r.reason).toBe("Employment type not covered");
  });
});

describe("rule 4: late hire", () => {
  // Acceptance 2 needs asOf on/after the hire date; before it, rule 1 wins.
  const nov = config({ asOfDate: "2026-11-30" });

  it("is EXEMPT when hired Oct 15 with cutoff Oct 1 (acceptance 2)", () => {
    expect(statusOf(emp("E1", { hire_date: "2026-10-15" }), [], nov)).toBe("EXEMPT");
  });

  it("treats hire_date equal to the cutoff as EXEMPT", () => {
    expect(statusOf(emp("E1", { hire_date: "2026-10-01" }), [], nov)).toBe("EXEMPT");
  });

  it("does not exempt someone hired the day before the cutoff", () => {
    expect(statusOf(emp("E1", { hire_date: "2026-09-30" }), [], nov)).toBe("AT_RISK");
  });
});

describe("rule 5: qualifying trainings", () => {
  it("is COMPLIANT with one qualifying training and AT_RISK with none", () => {
    const e = emp("E1");
    expect(evaluateEmployee(e, [att("E1", "2026-03-01")], config())).toMatchObject({
      status: "COMPLIANT",
      qualifyingCount: 1,
    });
    expect(evaluateEmployee(e, [], config())).toMatchObject({
      status: "AT_RISK",
      qualifyingCount: 0,
    });
  });

  it("ignores trainings after asOfDate and outside the year", () => {
    const rows = [att("E1", "2026-10-15"), att("E1", "2025-12-31"), att("E1", "2027-01-01")];
    expect(statusOf(emp("E1"), rows)).toBe("AT_RISK");
  });

  it("counts a training on the first day, the last allowed day and asOfDate", () => {
    const rows = [att("E1", "2026-01-01")];
    expect(statusOf(emp("E1"), rows)).toBe("COMPLIANT");
    expect(statusOf(emp("E1"), [att("E1", "2026-09-30")])).toBe("COMPLIANT");
  });

  it("is AT_RISK for a 0.5 h e-learning course when minHours = 1 (acceptance 4)", () => {
    const rows = [att("E1", "2026-05-01", { delivery: "elearning", hours: 0.5 })];
    expect(statusOf(emp("E1"), rows, config({ minHours: 1 }))).toBe("AT_RISK");
    expect(statusOf(emp("E1"), rows, config({ minHours: 0.5 }))).toBe("COMPLIANT");
  });

  it("is AT_RISK when elearningCounts is false and only e-learning attended (acceptance 5)", () => {
    const rows = [att("E1", "2026-05-01", { delivery: "elearning", hours: 4 })];
    expect(statusOf(emp("E1"), rows, config({ elearningCounts: false }))).toBe("AT_RISK");
    expect(statusOf(emp("E1"), rows, config({ elearningCounts: true }))).toBe("COMPLIANT");
  });

  it("still counts classroom training when elearningCounts is false", () => {
    const rows = [
      att("E1", "2026-05-01", { delivery: "elearning" }),
      att("E1", "2026-06-01", { delivery: "external" }),
    ];
    const r = evaluateEmployee(emp("E1"), rows, config({ elearningCounts: false }));
    expect(r).toMatchObject({ status: "COMPLIANT", qualifyingCount: 1 });
  });
});

describe("rule order (first match wins)", () => {
  const nov = config({ asOfDate: "2026-11-30" });

  it("applies rule 2 before rule 4 (separated late hire is EXCLUDED)", () => {
    const e = emp("E1", { hire_date: "2026-10-05", separation_date: "2026-10-20" });
    expect(statusOf(e, [], nov)).toBe("EXCLUDED");
  });

  it("applies rule 3 before rule 4 (uncovered late hire is NOT_COVERED)", () => {
    const e = emp("E1", { hire_date: "2026-10-05", employment_type: "casual" });
    expect(statusOf(e, [], config({ asOfDate: "2026-11-30", coveredTypes: ["regular"] }))).toBe(
      "NOT_COVERED",
    );
  });

  it("applies rule 1 before rule 2", () => {
    const e = emp("E1", { hire_date: "2026-12-01", separation_date: "2026-12-15" });
    expect(statusOf(e, [], nov)).toBe("NOT_COVERED");
  });
});

describe("evaluateRoster", () => {
  it("ignores orphan attendance rows and counts them in a warning", () => {
    const { results, warnings } = evaluateRoster(
      [emp("E1")],
      [att("E1", "2026-02-01"), att("GHOST", "2026-02-01")],
      config(),
    );
    expect(results).toHaveLength(1);
    expect(warnings.orphanAttendanceRows).toBe(1);
  });

  it("counts exact duplicate attendance rows once", () => {
    const row = att("E1", "2026-02-01");
    const { results, warnings } = evaluateRoster([emp("E1")], [row, { ...row }], config());
    expect(results[0].qualifyingCount).toBe(1);
    expect(warnings.duplicateAttendanceRows).toBe(1);
  });

  it("throws and processes nothing when employee_id repeats", () => {
    const run = () => evaluateRoster([emp("E1"), emp("E2"), emp("E1")], [], config());
    expect(run).toThrow(DuplicateEmployeeIdError);
    try {
      run();
    } catch (error) {
      expect((error as DuplicateEmployeeIdError).ids).toEqual(["E1"]);
    }
  });
});
