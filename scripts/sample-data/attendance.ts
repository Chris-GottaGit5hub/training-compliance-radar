import type { AttendanceRow } from "../../lib/schemas/rows";
import { TRAINING_TITLES } from "./people";
import { addDays, maxDate, minDate, randomDate, type Rng } from "./rng";
import type { PersonnelRow } from "./roster";

/*
 * Most covered staff train by Sep 30, a department-dependent share do not (the at-risk
 * group), and some of those close the gap in Q4 for the back-test.
 */
const BASE_RISK = 0.17;
const BOX_TICKING_CHANCE = 0.12;
const Q4_CLOSE_CHANCE = 0.45;
const PRIOR_YEAR_CHANCE = 0.15;

type Person = Pick<PersonnelRow, "employee_id" | "unit" | "hire_date" | "separation_date" | "licensed">;
type Forced = Pick<AttendanceRow, "delivery" | "hours">;

function makeRow(rng: Rng, emp: Person, date: string, forced?: Forced): AttendanceRow {
  const roll = rng.next();
  const licensed = emp.licensed === "yes";
  const delivery =
    forced?.delivery ??
    (licensed
      ? roll < 0.4 ? "classroom" : roll < 0.85 ? "elearning" : "external"
      : roll < 0.75 ? "classroom" : "external");
  const hours =
    forced?.hours ??
    (delivery === "classroom"
      ? rng.pick([4, 8, 8, 16, 24])
      : delivery === "elearning"
        ? rng.int(2, 12) / 2
        : rng.pick([8, 16, 24, 40]));
  const cost =
    delivery === "elearning" ? 0 : delivery === "classroom" ? rng.int(30, 130) * 50 : rng.int(56, 336) * 100;
  return {
    employee_id: emp.employee_id,
    training_title: rng.pick(TRAINING_TITLES),
    training_date: date,
    hours,
    delivery,
    cost,
  };
}

export function buildAttendance(
  rng: Rng,
  people: readonly Person[],
  year: number,
  riskOf: (unit: string) => number,
): AttendanceRow[] {
  const checkpoint = `${year}-09-30`;
  const q4Start = `${year}-10-01`;
  const lastDay = `${year}-12-20`;
  const rows: AttendanceRow[] = [];
  const seen = new Set<string>();

  for (const emp of people) {
    const start = maxDate(emp.hire_date, `${year}-01-01`);
    const end = minDate(emp.separation_date ?? lastDay, lastDay);
    const add = (date: string, forced?: Forced) => {
      const row = makeRow(rng, emp, date, forced);
      const key = `${row.employee_id}|${row.training_title}|${row.training_date}`;
      if (seen.has(key)) return; // never write exact duplicates (the app would warn)
      seen.add(key);
      rows.push(row);
    };

    if (emp.hire_date >= q4Start) {
      if (rng.chance(0.15)) add(randomDate(rng, emp.hire_date, minDate(addDays(emp.hire_date, 30), lastDay)));
      continue;
    }

    const separatedEarly = emp.separation_date !== undefined && emp.separation_date <= checkpoint;
    if (separatedEarly) {
      if (rng.chance(0.5)) add(randomDate(rng, start, end));
    } else if (!rng.chance(BASE_RISK * riskOf(emp.unit))) {
      const roll = rng.next();
      const count = roll < 0.65 ? 1 : roll < 0.9 ? 2 : 3;
      for (let i = 0; i < count; i++) add(randomDate(rng, start, checkpoint));
    } else {
      if (emp.licensed === "yes" && rng.chance(BOX_TICKING_CHANCE)) {
        add(randomDate(rng, start, checkpoint), { delivery: "elearning", hours: 0.5 });
      }
      if (end >= q4Start && rng.chance(Q4_CLOSE_CHANCE)) add(randomDate(rng, q4Start, end));
    }

    if (emp.hire_date < `${year}-01-01` && rng.chance(PRIOR_YEAR_CHANCE)) {
      add(randomDate(rng, maxDate(emp.hire_date, `${year - 1}-01-01`), `${year - 1}-12-31`));
    }
  }
  return rows;
}
