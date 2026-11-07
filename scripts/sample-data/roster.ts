import type { RosterRow } from "../../lib/schemas/rows";
import { FIRST_NAMES, LAST_NAMES, UNITS } from "./people";
import { randomDate, type Rng } from "./rng";

function hireDateFor(rng: Rng, year: number): { hire: string; canSeparate: boolean } {
  const r = rng.next();
  if (r < 0.04) {
    // Late hire: on/after the Oct 1 cutoff.
    return { hire: randomDate(rng, `${year}-10-01`, `${year}-10-31`), canSeparate: false };
  }
  if (r < 0.14) {
    // Mid-year hire.
    return { hire: randomDate(rng, `${year}-01-15`, `${year}-08-31`), canSeparate: false };
  }
  const hire = randomDate(rng, `${year - 20}-01-01`, `${year - 1}-12-31`);
  return { hire, canSeparate: true };
}

/** ~300 synthetic employees across 12 units (headcounts come from UNITS weights). */
export function buildRoster(rng: Rng, year: number): RosterRow[] {
  const roster: RosterRow[] = [];

  for (const [unit, spec] of Object.entries(UNITS)) {
    for (let i = 0; i < spec.weight; i++) {
      const { hire, canSeparate } = hireDateFor(rng, year);
      const typeRoll = rng.next();
      roster.push({
        employee_id: `EMP-${String(roster.length + 1).padStart(4, "0")}`,
        name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
        unit,
        position: rng.pick(spec.positions),
        employment_type: typeRoll < 0.75 ? "regular" : typeRoll < 0.9 ? "contractual" : "casual",
        hire_date: hire,
        separation_date:
          canSeparate && rng.chance(0.07)
            ? randomDate(rng, `${year}-02-01`, `${year}-12-15`)
            : undefined,
        licensed: rng.chance(0.7) ? "yes" : "no",
      });
    }
  }
  return roster;
}
