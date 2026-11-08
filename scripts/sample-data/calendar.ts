import type { CalendarRow } from "../../lib/schemas/rows";

/**
 * A small planned calendar for the sample data (spec §4.9): in-house runs priced per run,
 * one external course priced per head, and a run after the Dec 14 in-person cutoff.
 */
export function buildCalendar(year: number): CalendarRow[] {
  const d = (md: string) => `${year}-${md}`;
  return [
    { run_id: "R-01", course_id: "IH-001", date: d("10-15"), delivery: "in_house", cost_per_run: 3000, cost_per_head: 0, min_pax: 4, max_pax: 6 },
    { run_id: "R-02", course_id: "IH-008", date: d("10-29"), delivery: "in_house", cost_per_run: 2400, cost_per_head: 0, min_pax: 4, max_pax: 6 },
    { run_id: "R-03", course_id: "EXT-01", date: d("11-05"), delivery: "external", cost_per_run: undefined, cost_per_head: 6500, min_pax: 1, max_pax: 4 },
    { run_id: "R-04", course_id: "IH-005", date: d("12-09"), delivery: "in_house", cost_per_run: 4000, cost_per_head: 0, min_pax: 5, max_pax: 10 },
    { run_id: "R-05", course_id: "IH-004", date: d("12-16"), delivery: "in_house", cost_per_run: 3000, cost_per_head: 0, min_pax: 5, max_pax: 10 },
  ];
}
