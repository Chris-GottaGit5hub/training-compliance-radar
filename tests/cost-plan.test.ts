import { describe, expect, it } from "vitest";
import { evaluateRoster } from "@/lib/engine";
import { buildPlan, runAnalysis } from "@/lib/analysis";
import type { CalendarRow, CatalogRow } from "@/lib/schemas";
import { att, config, course, emp } from "./helpers/fixtures";

const linkedin = (fee?: number): CatalogRow => ({ ...course("LL", "linkedin_learning", 90, 0), unlicensed_fee: fee });
const inHouseCourse = course("IH", "in_house", 240, 1200);

const run = (id: string, date: string, over: Partial<CalendarRow> = {}): CalendarRow => ({
  run_id: id,
  course_id: "X",
  date,
  delivery: "in_house",
  cost_per_run: 3000,
  cost_per_head: 0,
  min_pax: 4,
  max_pax: 6,
  ...over,
});

// 3 licensed and 8 unlicensed people with no training.
const roster = [
  ...Array.from({ length: 3 }, (_, i) => emp(`L${i}`, { licensed: "yes" })),
  ...Array.from({ length: 8 }, (_, i) => emp(`U${i}`, { licensed: "no" })),
];
const { results } = evaluateRoster(roster, [], config());

describe("cheapest combination", () => {
  it("fills the cheapest run first even when it is later in the year", () => {
    const dear = run("DEAR", "2026-10-01", { cost_per_run: 4800 }); // ₱800 per head when full
    const cheap = run("CHEAP", "2026-11-20", { cost_per_run: 1800 }); // ₱300 per head when full
    const plan = buildPlan(results, roster, [linkedin(1000)], [dear, cheap], config());
    // The later, cheaper run takes 6 of the 8; only 2 remain, below DEAR's minimum of 4.
    expect(plan.runs.map((r) => [r.runId, r.participants, r.state])).toEqual([
      ["DEAR", 0, "cancelled"],
      ["CHEAP", 6, "held"],
    ]);
  });

  it("drops a run whose people would be cheaper on the LinkedIn fee", () => {
    // Only 2 people left after the full cheap run: ₱3000 for 2 is dearer than 2 × ₱800.
    const cheap = run("CHEAP", "2026-10-01", { cost_per_run: 1800, max_pax: 6, min_pax: 1 });
    const half = run("HALF", "2026-10-15", { cost_per_run: 3000, max_pax: 6, min_pax: 1 });
    const plan = buildPlan(results, roster, [linkedin(800)], [cheap, half], config());
    expect(plan.runs.find((r) => r.runId === "CHEAP")?.state).toBe("held");
    expect(plan.runs.find((r) => r.runId === "HALF")).toMatchObject({ state: "cancelled", cost: 0 });
    expect(plan.paidLinkedIn).toBe(2);
    expect(plan.totalPlannedCost).toBe(1800 + 2 * 800);
  });

  it("uses a nominated external training for one person when it is the cheapest option", () => {
    const external = run("EXT", "2026-10-20", { delivery: "external", cost_per_run: undefined, cost_per_head: 500, min_pax: 1, max_pax: 2 });
    const plan = buildPlan(results, roster, [linkedin(800)], [external], config());
    expect(plan.runs[0]).toMatchObject({ state: "held", participants: 2, cost: 1000 });
    expect(plan.paidLinkedIn).toBe(6); // the other six pay the LinkedIn fee
  });
});

describe("cost to close in the analysis", () => {
  const catalog = [linkedin(800), inHouseCourse];
  const cfg = config({ budgetPhp: 100_000 });
  const attendance = [att("L0", "2026-02-02", { cost: 12_000 })]; // L0 is trained and spent ₱12,000
  const base = { roster, attendance, catalog, config: cfg };

  it("estimates from catalog prices when there is no calendar", () => {
    const a = runAnalysis(base);
    expect(a.costSource).toBe("catalog");
    expect(a.cost?.costToClose).toBe(8 * 800); // 8 unlicensed on the cheaper LinkedIn fee, licensed free
  });

  it("uses the cheapest mix from the calendar and measures it against what is left of the allocation", () => {
    const a = runAnalysis({ ...base, calendar: [run("R1", "2026-10-15", { max_pax: 6, min_pax: 4 })] });
    expect(a.costSource).toBe("plan");
    // 2 licensed still at risk (L1, L2): free. 8 unlicensed: 6 in the run (₱3000), 2 on the fee (₱1600).
    expect(a.cost).toMatchObject({ costToClose: 4600, unpricedCount: 0 });
    expect(a.budget.remaining).toBe(88_000);
    expect(a.cost?.remaining).toBe(88_000 - 4600);
    expect(a.cost?.covered).toBe(true);
  });

  it("flags people who cannot be closed as a lower bound", () => {
    const a = runAnalysis({ ...base, catalog: [linkedin()], calendar: [run("R1", "2026-10-15", { max_pax: 3, min_pax: 1 })] });
    expect(a.cost?.unpricedCount).toBe(5);
    expect(a.cost?.covered).toBe(false);
  });

  it("reports no cost without a catalog or calendar", () => {
    expect(runAnalysis({ ...base, catalog: null }).cost).toBeNull();
  });
});
