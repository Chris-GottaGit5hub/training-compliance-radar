import type { EmploymentType } from "../../lib/schemas/rows";
import { randomDate, type Rng } from "../sample-data/rng";
import {
  DEPARTMENTS,
  EMAIL_DOMAIN,
  FAMILIES,
  FEMALE_FIRST,
  LAST_NAMES,
  MALE_FIRST,
  MANAGER_TITLES,
  type DepartmentSpec,
  type PositionSpec,
} from "./org";

/**
 * One row of the 10k personnel file. The first eight app columns keep the names the app
 * reads today (spec §2.1); `employee_id` holds the 5-digit Personnel Number, which the
 * attendance file links to. Every other column is extra, and the app ignores it for now.
 */
export interface PersonnelRow {
  employee_id: string;
  employee_no: string;
  name: string;
  sex: "F" | "M";
  position: string;
  pay_grade: string;
  unit: string;
  group: string;
  sector: string;
  region: string;
  employment_type: EmploymentType;
  employment_status: "active" | "separated";
  hire_date: string;
  separation_date?: string;
  licensed: "yes" | "no";
  employee_email: string;
  department_email: string;
  department_head: string;
}

export const PERSONNEL_COLUMNS = [
  "employee_id",
  "employee_no",
  "name",
  "sex",
  "position",
  "pay_grade",
  "unit",
  "group",
  "sector",
  "region",
  "employment_type",
  "employment_status",
  "hire_date",
  "separation_date",
  "licensed",
  "employee_email",
  "department_email",
  "department_head",
] as const;

/** Splits `total` across weights so the parts add up exactly (largest remainder). */
export function allocate(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const parts = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  const shortfall = total - parts.reduce((a, b) => a + b, 0);
  for (let k = 0; k < shortfall; k++) parts[order[k][1]]++;
  return parts;
}

/** `count` distinct values from `pool`, in random order (partial Fisher-Yates). */
function drawDistinct<T>(rng: Rng, pool: T[], count: number): T[] {
  const items = [...pool];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng.next() * (items.length - i));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, count);
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const slug = (text: string, sep: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}|\\${sep}$`, "g"), "");

function pickWeighted(rng: Rng, specs: readonly PositionSpec[]): PositionSpec {
  const total = specs.reduce((s, p) => s + p.weight, 0);
  let roll = rng.next() * total;
  for (const spec of specs) {
    roll -= spec.weight;
    if (roll < 0) return spec;
  }
  return specs[specs.length - 1];
}

/** Date of entry: seniors joined long ago; some staff are mid-year or late (exempt) hires. */
function hireDate(rng: Rng, pg: number, year: number): { hire: string; canSeparate: boolean } {
  if (pg >= 15) return { hire: randomDate(rng, `${year - 30}-01-01`, `${year - 8}-12-31`), canSeparate: false };
  if (pg >= 12) return { hire: randomDate(rng, `${year - 22}-01-01`, `${year - 3}-12-31`), canSeparate: true };
  const r = rng.next();
  if (r < 0.04) return { hire: randomDate(rng, `${year}-10-01`, `${year}-10-31`), canSeparate: false };
  if (r < 0.14) return { hire: randomDate(rng, `${year}-01-15`, `${year}-08-31`), canSeparate: false };
  return { hire: randomDate(rng, `${year - 20}-01-01`, `${year - 1}-12-31`), canSeparate: true };
}

/** Positions for one department: managers first, then staff drawn from the family's weights. */
function positionsFor(
  rng: Rng,
  dept: DepartmentSpec,
  headcount: number,
  extraHeads: PositionSpec[],
): PositionSpec[] {
  const m = MANAGER_TITLES;
  const managers: PositionSpec[] = [
    { ...m.departmentManager, weight: 0 },
    ...extraHeads,
    ...Array.from({ length: Math.max(1, Math.round(headcount / 150)) }, () => ({
      ...m.assistantManager,
      weight: 0,
    })),
  ];
  const staff = Array.from({ length: headcount - managers.length }, () =>
    pickWeighted(rng, FAMILIES[dept.family]),
  );
  return [...managers, ...staff];
}

/** About 10,000 fictional employees in 50 departments under 7 sectors. Deterministic for a seed. */
export function buildPersonnel(rng: Rng, year: number, total = 10_000): PersonnelRow[] {
  const counts = allocate(DEPARTMENTS.map((d) => d.weight), total);
  const personnelNumbers = drawDistinct(rng, range(10_000, 99_999), total).map(String);
  const employeeNos = drawDistinct(
    rng,
    LETTERS.flatMap((l) => range(100, 999).map((n) => `${l}${n}`)),
    total,
  );
  const seenGroups = new Set<string>();
  const seenSectors = new Set<string>();
  const rows: PersonnelRow[] = [];
  const separationEnd = `${year}-11-06`;

  DEPARTMENTS.forEach((dept, deptIndex) => {
    const extraHeads: PositionSpec[] = [];
    if (!seenSectors.has(dept.sector)) extraHeads.push({ ...MANAGER_TITLES.sectorHead, weight: 0 });
    if (!seenGroups.has(dept.group)) extraHeads.push({ ...MANAGER_TITLES.groupHead, weight: 0 });
    seenSectors.add(dept.sector);
    seenGroups.add(dept.group);

    const departmentEmail = `${slug(dept.name, "-")}@${EMAIL_DOMAIN}`;
    let head = "";

    for (const position of positionsFor(rng, dept, counts[deptIndex], extraHeads)) {
      const index = rows.length;
      const sex = rng.chance(0.57) ? "F" : "M";
      const first = rng.pick(sex === "F" ? FEMALE_FIRST : MALE_FIRST);
      const last = rng.pick(LAST_NAMES);
      const name = `${first} ${rng.pick(LETTERS)}. ${last}`;
      if (position.title === MANAGER_TITLES.departmentManager.title) head = name;

      const { hire, canSeparate } = hireDate(rng, position.pg, year);
      const separation =
        canSeparate && rng.chance(0.07) ? randomDate(rng, `${year}-02-01`, separationEnd) : undefined;
      const typeRoll = rng.next();
      const employmentType: EmploymentType =
        position.pg >= 13 || typeRoll < 0.8 ? "regular" : typeRoll < 0.92 ? "contractual" : "casual";

      rows.push({
        employee_id: personnelNumbers[index],
        employee_no: employeeNos[index],
        name,
        sex,
        position: position.title,
        pay_grade: `PG ${position.pg}`,
        unit: dept.name,
        group: dept.group,
        sector: dept.sector,
        region: dept.region,
        employment_type: employmentType,
        employment_status: separation ? "separated" : "active",
        hire_date: hire,
        ...(separation ? { separation_date: separation } : {}),
        licensed: rng.chance(0.7) ? "yes" : "no",
        employee_email: `${slug(first, "")}.${slug(last, "")}.${personnelNumbers[index]}@${EMAIL_DOMAIN}`,
        department_email: departmentEmail,
        department_head: "", // filled below, once the department manager exists
      });
    }
    for (let i = rows.length - counts[deptIndex]; i < rows.length; i++) rows[i].department_head = head;
  });

  return rows.sort((a, b) => (a.employee_id < b.employee_id ? -1 : 1));
}

/** Engine-side risk factor for each department, used by the attendance builder. */
export const departmentRisk = (unit: string): number =>
  DEPARTMENTS.find((d) => d.name === unit)?.risk ?? 1;
