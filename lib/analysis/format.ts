const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

export const formatPeso = (amount: number): string => peso.format(amount);

/**
 * Short peso amount for tight spaces such as KPI cards: ₱25.19M from one million up, two
 * decimals; smaller amounts stay in full. Pair it with the full amount in a tooltip.
 */
export function formatPesoMillions(amount: number): string {
  const abs = Math.abs(amount);
  if (abs < 1_000_000) return formatPeso(amount);
  return `${amount < 0 ? "-" : ""}₱${(abs / 1_000_000).toFixed(2)}M`;
}

/** `rate` is already a percent (0-100), as returned by the engine. */
export const formatPercent = (rate: number): string => `${rate.toFixed(1)}%`;

/** A 0-1 ratio (back-test recall/precision) as a whole percent; null shows a dash. */
export const formatRatio = (ratio: number | null): string =>
  ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
