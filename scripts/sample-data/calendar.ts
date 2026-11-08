import type { CalendarRow } from "../../lib/schemas/rows";

type InHouse = [courseId: string, title: string, md: string, hours: number, speakers: number, expected: number];
type Program = [key: string, title: string, fee: number, max: number, expected: number];

/**
 * Twelve in-house runs (min 10, max 40 each). Costs are left blank so the app derives them from
 * the company's rules: speaker honoraria plus snacks per participant (spec §4.9).
 */
const IN_HOUSE: InHouse[] = [
  ["IH-001", "Code of Conduct and Ethics Workshop", "01-22", 4, 1, 30],
  ["IH-002", "Records Management and Documentation", "02-19", 8, 2, 35],
  ["IH-004", "Customer Handling in Banking Operations", "03-12", 4, 1, 40],
  ["IH-005", "Risk and Control Self-Assessment", "04-16", 8, 2, 30],
  ["IH-008", "Occupational Safety and Health Orientation", "05-14", 4, 1, 40],
  ["IH-007", "Effective Report Writing", "06-11", 4, 1, 35],
  ["IH-003", "Supervisory Skills Seminar", "07-16", 8, 3, 30],
  ["IH-009", "Introduction to Government Accounting", "08-13", 8, 2, 30],
  ["IH-010", "Information Security Hands-on Lab", "09-17", 8, 2, 25],
  ["IH-005", "Risk and Control Self-Assessment", "10-15", 8, 2, 40],
  ["IH-006", "Procurement Law Refresher", "11-12", 8, 2, 40],
  ["IH-007", "Effective Report Writing", "11-26", 4, 1, 40],
];

/** Twelve external programs; the fee is per participant and the same wherever it is held. */
const PROGRAMS: Record<string, Program> = {
  itil: ["itil", "ITIL 4 Foundation", 18_000, 30, 20],
  dpo: ["dpo", "Data Privacy Officer Certification", 15_000, 30, 20],
  ceh: ["ceh", "Certified Ethical Hacker", 45_000, 15, 8],
  pmp: ["pmp", "PMP Exam Preparation", 35_000, 20, 12],
  cobit: ["cobit", "COBIT 2019 Foundation", 22_000, 20, 12],
  lss: ["lss", "Lean Six Sigma Green Belt", 28_000, 20, 12],
  aml: ["aml", "AML/CFT Specialist Course", 12_000, 40, 30],
  iso27: ["iso27", "ISO 27001 Lead Implementer", 38_000, 15, 8],
  proc: ["proc", "Government Procurement Updates", 8_500, 50, 40],
  bcm: ["bcm", "Business Continuity (ISO 22301)", 24_000, 20, 12],
  excel: ["excel", "Advanced Excel and Power BI", 9_500, 60, 40],
  credit: ["credit", "Credit Risk Management", 16_000, 30, 20],
};

/** 36 external sessions (3 for each in-house run, a 3:1 mix); the year-end rush is the busiest. */
const EXTERNAL: [md: string, program: keyof typeof PROGRAMS][] = [
  ["01-20", "itil"], ["01-27", "dpo"], ["02-10", "aml"], ["02-24", "proc"], ["03-10", "pmp"], ["03-24", "excel"],
  ["04-14", "cobit"], ["04-28", "credit"], ["05-12", "ceh"], ["05-26", "iso27"], ["06-09", "lss"], ["06-23", "bcm"],
  ["07-14", "itil"], ["07-28", "dpo"], ["08-04", "aml"], ["08-11", "proc"], ["08-18", "pmp"], ["08-25", "excel"],
  ["09-01", "cobit"], ["09-08", "credit"], ["09-15", "ceh"], ["09-22", "iso27"],
  ["10-06", "lss"], ["10-08", "bcm"], ["10-13", "itil"], ["10-15", "dpo"], ["10-20", "aml"], ["10-22", "proc"],
  ["10-27", "pmp"], ["10-29", "excel"], ["11-03", "cobit"], ["11-10", "credit"], ["11-17", "ceh"], ["11-24", "iso27"],
  ["12-01", "lss"], ["12-08", "itil"],
];

/**
 * A year of planned trainings (spec §4.9): in-house runs priced from the company's rules and
 * external trainings priced at their fee per participant, external : in-house = 3 : 1.
 */
export function buildCalendar(year: number): CalendarRow[] {
  const d = (md: string) => `${year}-${md}`;
  const inHouse: CalendarRow[] = IN_HOUSE.map(([course_id, run_title, md, hours, speakers, expected], i) => ({
    run_id: `IH-R${String(i + 1).padStart(2, "0")}`,
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
  const external: CalendarRow[] = EXTERNAL.map(([md, key], i) => {
    const [, run_title, fee, max, expected] = PROGRAMS[key];
    return {
      run_id: `EX-R${String(i + 1).padStart(2, "0")}`,
      course_id: "EXTERNAL",
      run_title,
      date: d(md),
      delivery: "external",
      cost_per_head: fee,
      min_pax: 1,
      max_pax: max,
      expected_pax: expected,
    };
  });
  return [...inHouse, ...external].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.run_id < b.run_id ? -1 : 1));
}
