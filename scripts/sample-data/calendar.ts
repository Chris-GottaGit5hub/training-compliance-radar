import type { CalendarRow } from "../../lib/schemas/rows";

type InHouse = [id: string, courseId: string, title: string, md: string, hours: number, speakers: number, expected: number];
type External = [id: string, title: string, md: string, fee: number, max: number, expected: number];

/** Four in-house runs; costs are left blank so the app derives them (honoraria and snacks, spec §4.9). */
const IN_HOUSE: InHouse[] = [
  ["IH-R1", "IH-001", "Code of Conduct and Ethics Workshop", "02-12", 4, 1, 30],
  ["IH-R2", "IH-002", "Records Management and Documentation", "05-14", 8, 2, 30],
  ["IH-R3", "IH-005", "Risk and Control Self-Assessment", "10-15", 8, 2, 30],
  ["IH-R4", "IH-007", "Effective Report Writing", "11-26", 4, 1, 25],
];

/** Twelve external trainings, a 3:1 mix with the in-house runs; the fee is per participant. */
const EXTERNAL: External[] = [
  ["EX-R01", "ITIL 4 Foundation", "01-27", 18_000, 6, 4],
  ["EX-R02", "Data Privacy Officer Certification", "02-24", 15_000, 5, 3],
  ["EX-R03", "Certified Ethical Hacker", "03-17", 45_000, 3, 2],
  ["EX-R04", "PMP Exam Preparation", "04-21", 35_000, 4, 3],
  ["EX-R05", "COBIT 2019 Foundation", "05-19", 22_000, 4, 3],
  ["EX-R06", "Lean Six Sigma Green Belt", "06-23", 28_000, 4, 2],
  ["EX-R07", "AML/CFT Specialist Course", "08-11", 12_000, 6, 4],
  ["EX-R08", "ITIL 4 Foundation", "10-06", 18_000, 6, 4],
  ["EX-R09", "ISO 27001 Lead Implementer", "10-27", 38_000, 3, 2],
  ["EX-R10", "Government Procurement Updates", "11-10", 8_500, 8, 5],
  ["EX-R11", "Business Continuity (ISO 22301)", "11-24", 24_000, 4, 2],
  ["EX-R12", "Advanced Excel and Power BI", "12-08", 9_500, 8, 4],
];

/**
 * A year of planned trainings (spec §4.9): in-house runs priced from the company's rules
 * and external trainings priced at their fee per participant, external : in-house = 3 : 1.
 */
export function buildCalendar(year: number): CalendarRow[] {
  const d = (md: string) => `${year}-${md}`;
  const inHouse: CalendarRow[] = IN_HOUSE.map(([run_id, course_id, run_title, md, hours, speakers, expected]) => ({
    run_id,
    course_id,
    run_title,
    date: d(md),
    delivery: "in_house",
    hours,
    speakers,
    min_pax: 10,
    max_pax: 40,
    expected_pax: expected,
  }));
  const external: CalendarRow[] = EXTERNAL.map(([run_id, run_title, md, fee, max, expected]) => ({
    run_id,
    course_id: "EXTERNAL",
    run_title,
    date: d(md),
    delivery: "external",
    cost_per_head: fee,
    min_pax: 1,
    max_pax: max,
    expected_pax: expected,
  }));
  return [...inHouse, ...external].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
