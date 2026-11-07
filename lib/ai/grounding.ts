const round1 = (n: number): number => Math.round(n * 10) / 10;

// Digits not glued to letters (so "Q4" is ignored), with optional thousands commas and decimals.
const NUMBER = /(?<![A-Za-z\d])\d[\d,]*(?:\.\d+)?/g;
// "1. Do this" / "2) Do that" list markers are not figures.
const LIST_MARKER = /^\s*\d+[.)]\s+/gm;

export function extractNumbers(text: string): number[] {
  const matches = text.replace(LIST_MARKER, "").match(NUMBER) ?? [];
  return matches.map((m) => Number(m.replaceAll(",", ""))).filter(Number.isFinite);
}

/** Every number that appears anywhere in the request (values and text), at 1 decimal. */
export function collectRequestNumbers(request: unknown): Set<number> {
  const allowed = new Set<number>();
  const add = (n: number) => allowed.add(round1(n));
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === "number") {
      add(value);
      if (key === "durationMinutes") add(value / 60); // "2 hours" for a 120-minute course
    } else if (typeof value === "string") {
      extractNumbers(value).forEach(add);
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(v, key));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => walk(v, k));
    }
  };
  walk(request);
  return allowed;
}

/** Numbers in `text` that are not in the request (spec §5 numeric grounding check). */
export function ungroundedNumbers(text: string, request: unknown): number[] {
  const allowed = collectRequestNumbers(request);
  return [...new Set(extractNumbers(text).map(round1))].filter((n) => !allowed.has(n));
}
