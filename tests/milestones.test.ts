import { describe, expect, it } from "vitest";
import { evaluateMilestones, milestoneDates, payGradeBand } from "@/lib/engine";
import { att, config, emp } from "./helpers/fixtures";

// 20 people: 6 trained by Mar 31, 10 by Jun 30, 16 by Sep 30, the rest never.
const roster = Array.from({ length: 20 }, (_, i) => emp(`E${i + 1}`));
const trainedOn = (from: number, to: number, date: string) =>
  roster.slice(from, to).map((e) => att(e.employee_id, date));
const attendance = [
  ...trainedOn(0, 6, "2026-02-01"),
  ...trainedOn(6, 10, "2026-05-01"),
  ...trainedOn(10, 16, "2026-08-01"),
];

describe("evaluateMilestones", () => {
  const rows = evaluateMilestones(roster, attendance, config());
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

  it("uses the four target dates of the year", () => {
    expect(milestoneDates(2026)).toEqual(["2026-03-31", "2026-06-30", "2026-09-30", "2026-11-30"]);
    expect(rows.map((r) => r.date)).toEqual(milestoneDates(2026));
  });

  it("marks past dates met or missed from the roster as of that date", () => {
    expect(byLabel["Mar 31"]).toMatchObject({ trained: 6, untrained: 14, targetTrained: 5, state: "met", gap: 1 });
    expect(byLabel["Jun 30"]).toMatchObject({ trained: 10, targetTrained: 10, state: "met", gap: 0 });
    // 85% of 20 is 17; only 16 are trained.
    expect(byLabel["Sep 30"]).toMatchObject({ trained: 16, targetTrained: 17, state: "missed", gap: -1, needed: 1 });
  });

  it("shows a future date as upcoming with the people still needed", () => {
    expect(byLabel["Nov 30"]).toMatchObject({ state: "upcoming", trained: 16, targetTrained: 20, needed: 4 });
  });

  it("reports the trained share rounded to one decimal", () => {
    expect(byLabel["Sep 30"].actualPct).toBe(80);
    expect(byLabel["Mar 31"].actualPct).toBe(30);
  });

  it("rounds the target headcount up and never counts people outside scope", () => {
    const small = Array.from({ length: 7 }, (_, i) => emp(`S${i}`));
    const out = [...small, emp("X", { separation_date: "2026-01-10" })];
    const m = evaluateMilestones(out, [], config())[0];
    expect(m.inScope).toBe(7);
    expect(m.targetTrained).toBe(2); // 25% of 7 = 1.75
  });

  it("treats every date after the as-of date as upcoming", () => {
    const early = evaluateMilestones(roster, attendance, config({ asOfDate: "2026-02-15" }));
    expect(early.map((r) => r.state)).toEqual(["upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(early[0].trained).toBe(6);
  });
});

describe("payGradeBand", () => {
  it("maps grades to bands", () => {
    expect(payGradeBand(4)).toBe("Rank and File");
    expect(payGradeBand(9)).toBe("Rank and File");
    expect(payGradeBand(10)).toBe("Officers");
    expect(payGradeBand(13)).toBe("Officers");
    expect(payGradeBand(14)).toBe("Senior Officers");
    expect(payGradeBand(18)).toBe("Senior Officers");
    expect(payGradeBand(3)).toBe("Unbanded");
    expect(payGradeBand(19)).toBe("Unbanded");
    expect(payGradeBand(undefined)).toBe("Unbanded");
  });
});
