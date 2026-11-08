import type { CalendarRow } from "@/lib/schemas/rows";

/** The company's costing rules for in-house runs (spec §4.9). All amounts are PHP. */
export const COSTING = {
  /** Honorarium per speaker for every 2 hours. */
  honorariumPerTwoHours: 500,
  /** Snack cost per participant for each 4 hours, at most `maxSnacks` (₱75 for 4 hours, ₱150 for a full day). */
  snackPerFourHours: 75,
  maxSnacks: 2,
  defaultHours: 8,
  defaultSpeakers: 1,
} as const;

export interface ResolvedRun {
  /** Fixed cost of holding the run (honoraria for in-house). */
  perRun: number;
  /** Cost for each participant (snacks for in-house, the fee for external). */
  perHead: number;
  hours: number;
  speakers: number;
  /** Planned enrolment used for budgeting. */
  expectedPax: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Fills blank cost cells from the costing rules (spec §4.9). */
export function resolveRun(run: CalendarRow): ResolvedRun {
  const hours = run.hours ?? COSTING.defaultHours;
  const speakers = run.speakers ?? COSTING.defaultSpeakers;
  const inHouse = run.delivery === "in_house";
  const honoraria = inHouse ? speakers * COSTING.honorariumPerTwoHours * Math.ceil(hours / 2) : 0;
  const snacks = inHouse
    ? COSTING.snackPerFourHours * Math.min(COSTING.maxSnacks, Math.ceil(hours / 4))
    : 0;
  return {
    perRun: run.cost_per_run ?? honoraria,
    perHead: run.cost_per_head ?? snacks,
    hours,
    speakers,
    expectedPax: run.expected_pax ?? run.max_pax,
  };
}

/** Cost of a run with `people` participants. */
export const runCost = (resolved: ResolvedRun, people: number): number =>
  round2(resolved.perRun + resolved.perHead * people);
