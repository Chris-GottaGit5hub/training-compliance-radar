import { describe, expect, it } from "vitest";
import { costToClose } from "@/lib/engine";
import { config, course, emp, result } from "./helpers/fixtures";

const linkedin = (fee?: number) => ({ ...course("LL", "linkedin_learning", 90, 0), unlicensed_fee: fee });
const inHouse = (cost: number) => course("IH", "in_house", 240, cost);

const roster = [emp("L", { licensed: "yes" }), emp("U", { licensed: "no" })];
const atRisk = [result("L", "Unit A", "AT_RISK"), result("U", "Unit A", "AT_RISK")];

describe("cost to close with three routes", () => {
  it("charges licensed staff the LinkedIn price (₱0) and unlicensed staff the cheaper fee", () => {
    const cost = costToClose(atRisk, roster, [linkedin(800), inHouse(1200)], config());
    expect(cost.costToClose).toBe(800); // licensed 0 + unlicensed fee 800
    expect(cost.unpricedCount).toBe(0);
  });

  it("keeps the in-house price when it is cheaper than the LinkedIn fee", () => {
    expect(costToClose(atRisk, roster, [linkedin(800), inHouse(450)], config()).costToClose).toBe(450);
  });

  it("ignores LinkedIn courses without an unlicensed fee", () => {
    expect(costToClose(atRisk, roster, [linkedin(), inHouse(450)], config()).costToClose).toBe(450);
    const none = costToClose(atRisk, roster, [linkedin()], config());
    expect(none.unpricedCount).toBe(1);
  });

  it("uses the paid LinkedIn route alone when no in-house course qualifies", () => {
    expect(costToClose(atRisk, roster, [linkedin(800)], config()).costToClose).toBe(800);
  });

  it("does not offer the paid route when e-learning does not count", () => {
    const cost = costToClose(atRisk, roster, [linkedin(300), inHouse(450)], config({ elearningCounts: false }));
    expect(cost.costToClose).toBe(900); // both people on the in-house route
  });

  it("charges every route against the annual budget", () => {
    const cost = costToClose(atRisk, roster, [linkedin(800), inHouse(1200)], config({ budgetPhp: 1000 }));
    expect(cost).toMatchObject({ costToClose: 800, remaining: 200, covered: true });
  });
});
