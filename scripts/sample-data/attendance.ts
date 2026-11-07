import type { AttendanceRow, RosterRow } from "../../lib/schemas/rows";
import { TRAINING_TITLES, UNITS } from "./people";
import { addDays, maxDate, minDate, randomDate, type Rng } from "./rng";

/** Base chance of being untrained at the Sep 30 checkpoint, scaled by each unit's risk factor. */
const BASE_RISK = 0.18;
const BOX_TICKING_CHANCE = 0.12;
const Q4_CLOSE_CHANCE = 0.45;
const PRIOR_YEAR_CHANCE = 0.15;

function makeRow(
  rng: Rng,
  emp: RosterRow,
  date: string,
  forced?: Pick<AttendanceRow, "delivery" | "hours">,
): AttendanceRow {
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
    delivery === "elearning"
      ? 0
      : delivery === "classroom"
        ? rng.int(30, 130) * 50
        : rng.int(50, 300) * 100;

  return {
    employee_id: emp.employee_id,
    training_title: rng.pick(TRAINING_TITLES),
    training_date: date,
    hours,
    delivery,
    cost,
  };
}

/**
 * Attendance for the whole year: most covered employees are trained by Sep 30,
 * a unit-dependent share is not (the at-risk group), and some of those close
 * the gap in Q4 so the back-test has something to measure.
 */
export function buildAttendance(rng: Rng, roster: RosterRow[], year: number): AttendanceRow[] {
  const checkpoint = `${year}-09-30`;
  const q4Start = `${year}-10-01`;
  const lastDay = `${year}-12-20`;
  const rows: AttendanceRow[] = [];

  for (const emp of roster) {
    const start = maxDate(emp.hire_date, `${year}-01-01`);
    const end = minDate(emp.separation_date ?? lastDay, lastDay);
    const add = (date: string, forced?: Pick<AttendanceRow, "delivery" | "hours">) =>
      rows.push(makeRow(rng, emp, date, forced));

    if (emp.hire_date >= q4Start) {
      // Late hire (exempt): occasionally trained shortly after joining.
      if (rng.chance(0.15)) add(randomDate(rng, emp.hire_date, minDate(addDays(emp.hire_date, 30), lastDay)));
      continue;
    }

    const separatedEarly = emp.separation_date !== undefined && emp.separation_date <= checkpoint;
    if (separatedEarly) {
      if (rng.chance(0.5)) add(randomDate(rng, start, end));
    } else if (!rng.chance(BASE_RISK * UNITS[emp.unit].risk)) {
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
      const from = maxDate(emp.hire_date, `${year - 1}-01-01`);
      add(randomDate(rng, from, `${year - 1}-12-31`));
    }
  }

  return rows;
}
