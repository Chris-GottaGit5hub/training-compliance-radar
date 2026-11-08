import { describe, expect, it } from "vitest";
import { evaluateRoster } from "@/lib/engine";
import { availableDimensions, breakdown, dimensionValues } from "@/lib/analysis";
import { att, config, emp } from "./helpers/fixtures";

const roster = [
  emp("A", { unit: "Ops", pay_grade: 5, group: "G1", sector: "S1" }),
  emp("B", { unit: "Ops", pay_grade: 11, group: "G1", sector: "S1" }),
  emp("C", { unit: "Fin", pay_grade: 15, group: "G2", sector: "S2" }),
  emp("D", { unit: "Fin", pay_grade: 5, group: "G2", sector: "S2" }),
  emp("E", { unit: "Fin", pay_grade: 10, group: "G2", sector: "S2" }),
  emp("F", { unit: "Fin", separation_date: "2026-01-05" }), // excluded, never counted
];
const { results } = evaluateRoster(roster, [att("A", "2026-03-01"), att("C", "2026-03-01"), att("E", "2026-03-01")], config());

describe("breakdown", () => {
  it("groups trained and untrained by band, leaving out people outside scope", () => {
    // Officers and Rank and File tie on untrained and rate, so the key breaks the tie.
    expect(breakdown(results, roster, "band")).toEqual([
      { key: "Officers", inScope: 2, trained: 1, untrained: 1, rate: 50 },
      { key: "Rank and File", inScope: 2, trained: 1, untrained: 1, rate: 50 },
      { key: "Senior Officers", inScope: 1, trained: 1, untrained: 0, rate: 100 },
    ]);
  });

  it("combines filters across dimensions", () => {
    const rows = breakdown(results, roster, "payGrade", { sector: "S2", band: "Officers" });
    expect(rows).toEqual([{ key: "PG 10", inScope: 1, trained: 1, untrained: 0, rate: 100 }]);
  });

  it("sorts by untrained, then rate, then key in natural order", () => {
    const keys = breakdown(results, roster, "payGrade").map((r) => r.key);
    // PG 11 (0% trained) before PG 5 (50%); PG 10 before PG 15 by natural order, not "PG 15" < "PG 5".
    expect(keys).toEqual(["PG 11", "PG 5", "PG 10", "PG 15"]);
  });

  it("shows missing group and sector as Unassigned", () => {
    const bare = [emp("Z"), emp("Y", { group: "G9" })];
    const res = evaluateRoster(bare, [], config()).results;
    expect(breakdown(res, bare, "group").map((r) => r.key).sort()).toEqual(["G9", "Unassigned"]);
  });

  it("returns nothing when no one matches", () => {
    expect(breakdown(results, roster, "unit", { sector: "Nope" })).toEqual([]);
  });
});

describe("dimension helpers", () => {
  it("offers only the dimensions the roster fills in", () => {
    expect(availableDimensions([emp("A")])).toEqual(["unit"]);
    expect(availableDimensions(roster)).toEqual(["band", "payGrade", "unit", "group", "sector"]);
  });

  it("lists slicer values in a natural order", () => {
    expect(dimensionValues(roster, "payGrade")).toEqual(["PG 5", "PG 10", "PG 11", "PG 15", "Unassigned"]);
    expect(dimensionValues(roster, "band")).toEqual(["Rank and File", "Officers", "Senior Officers", "Unbanded"]);
  });
});
