import { describe, expect, it } from "vitest";
import { formatPeso, formatPesoMillions } from "@/lib/analysis";

describe("formatPesoMillions", () => {
  it("shortens millions to two decimals", () => {
    expect(formatPesoMillions(25_187_500)).toBe("₱25.19M");
    expect(formatPesoMillions(100_000_000)).toBe("₱100.00M");
    expect(formatPesoMillions(1_000_000)).toBe("₱1.00M");
  });

  it("keeps amounts under one million in full", () => {
    expect(formatPesoMillions(332_000)).toBe(formatPeso(332_000));
    expect(formatPesoMillions(0)).toBe(formatPeso(0));
  });

  it("keeps the sign of a shortfall", () => {
    expect(formatPesoMillions(-2_500_000)).toBe("-₱2.50M");
  });
});
