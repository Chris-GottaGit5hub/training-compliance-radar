const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

export const formatPeso = (amount: number): string => peso.format(amount);

/** `rate` is already a percent (0-100), as returned by the engine. */
export const formatPercent = (rate: number): string => `${rate.toFixed(1)}%`;

/** A 0-1 ratio (back-test recall/precision) as a whole percent; null shows a dash. */
export const formatRatio = (ratio: number | null): string =>
  ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
