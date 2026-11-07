export type Rng = ReturnType<typeof createRng>;

/** Seeded mulberry32 PRNG with small helpers, so output is reproducible. */
export function createRng(seed: number) {
  let state = seed | 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number): boolean => next() < p,
    int: (min: number, max: number): number => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  };
}

const DAY_MS = 86_400_000;
const toMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

export function addDays(iso: string, days: number): string {
  return new Date(toMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Uniform random date in [from, to] inclusive; returns `from` if the range is empty. */
export function randomDate(rng: Rng, from: string, to: string): string {
  const span = Math.round((toMs(to) - toMs(from)) / DAY_MS);
  return span <= 0 ? from : addDays(from, rng.int(0, span));
}

export const maxDate = (a: string, b: string): string => (a > b ? a : b);
export const minDate = (a: string, b: string): string => (a < b ? a : b);
