import { z } from "zod";
import { isRealDate } from "./dates";

export const EMPLOYMENT_TYPES = ["regular", "contractual"] as const;
export const DELIVERY_TYPES = ["classroom", "elearning", "external"] as const;
export const PROVIDERS = ["linkedin_learning", "in_house"] as const;
export const RUN_DELIVERIES = ["in_house", "external"] as const;

export const ROSTER_COLUMNS = [
  "employee_id",
  "personnel_number",
  "name",
  "unit",
  "position",
  "employment_type",
  "hire_date",
  "separation_date",
  "licensed",
  "pay_grade",
  "group",
  "sector",
] as const;
export const ATTENDANCE_COLUMNS = [
  "employee_id",
  "training_title",
  "training_date",
  "hours",
  "delivery",
  "cost",
] as const;
export const CATALOG_COLUMNS = [
  "course_id",
  "title",
  "skill_area",
  "duration_minutes",
  "provider",
  "url",
  "cost_per_head",
  "unlicensed_fee",
  "recommended",
] as const;

export const CALENDAR_COLUMNS = [
  "run_id",
  "course_id",
  "run_title",
  "date",
  "delivery",
  "hours",
  "speakers",
  "cost_per_run",
  "cost_per_head",
  "min_pax",
  "max_pax",
  "expected_pax",
] as const;

/** Columns that may be absent from the header, per file (their cells are optional). */
export const OPTIONAL_COLUMNS: Record<
  "roster" | "attendance" | "catalog" | "calendar",
  readonly string[]
> = {
  roster: ["personnel_number", "separation_date", "pay_grade", "group", "sector"],
  attendance: [],
  catalog: ["url", "unlicensed_fee", "recommended"],
  calendar: ["run_title", "hours", "speakers", "cost_per_run", "expected_pax"],
};

/** `8`, `PG8` and `PG 8` (any case) all mean pay grade 8; anything else is left for the schema to reject. */
export function parsePayGrade(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const match = /^(?:pg\s*)?(\d{1,2})$/i.exec(value.trim());
  return match ? Number(match[1]) : value;
}

type RawIssue = { input?: unknown };
const missingOr = (message: string) => (issue: RawIssue) =>
  issue.input === undefined ? "is required" : message;

const text = z
  .string({ error: "is required" })
  .min(1, "is required");

const dateString = z
  .string({ error: "is required" })
  .refine(isRealDate, "must be a real date written as YYYY-MM-DD");

const emptyToUndefined = z.literal("").transform(() => undefined);

const lowerEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.enum(values, { error: missingOr(`must be one of: ${values.join(", ")}`) }),
  );

const toNumber = (v: unknown): unknown =>
  typeof v === "string" ? (v.trim() === "" ? undefined : Number(v)) : v;

const number = () => z.number({ error: missingOr("must be a number") });

const nonNegative = z.preprocess(
  toNumber,
  number().min(0, "must be 0 or more"),
);
const positiveInt = z.preprocess(
  toNumber,
  number().int("must be a whole number").positive("must be greater than 0"),
);

const payGrade = z.preprocess(
  parsePayGrade,
  z
    .number({ error: "must be a whole number such as 8, PG8 or PG 8" })
    .int("must be a whole number such as 8, PG8 or PG 8")
    .min(1, "must be between 1 and 30")
    .max(30, "must be between 1 and 30"),
);

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export const rosterRowSchema = z
  .object({
    employee_id: text,
    personnel_number: z
      .string()
      .regex(/^\d{5}$/, "must be exactly 5 digits")
      .optional(),
    name: text,
    unit: text,
    position: text,
    employment_type: lowerEnum(EMPLOYMENT_TYPES),
    hire_date: dateString,
    separation_date: z.union([emptyToUndefined, dateString]).optional(),
    licensed: lowerEnum(["yes", "no"] as const),
    pay_grade: payGrade.optional(),
    group: text.optional(),
    sector: text.optional(),
  })
  .refine((r) => !r.separation_date || r.separation_date >= r.hire_date, {
    path: ["separation_date"],
    message: "must be on or after hire_date",
  });

export const attendanceRowSchema = z.object({
  employee_id: text,
  training_title: text,
  training_date: dateString,
  hours: nonNegative,
  delivery: lowerEnum(DELIVERY_TYPES),
  cost: nonNegative,
});

export const catalogRowSchema = z.object({
  course_id: text,
  title: text,
  skill_area: text,
  duration_minutes: positiveInt,
  provider: lowerEnum(PROVIDERS),
  url: z
    .union([emptyToUndefined, z.string().refine(isHttpsUrl, "must be an https URL")])
    .optional(),
  cost_per_head: nonNegative,
  unlicensed_fee: nonNegative.optional(),
  recommended: lowerEnum(["yes", "no"] as const).optional(),
});

const positiveNumber = z.preprocess(
  toNumber,
  number().positive("must be greater than 0").max(24, "must be 24 or less"),
);
const smallCount = z.preprocess(
  toNumber,
  number().int("must be a whole number").min(0, "must be 0 or more").max(20, "must be 20 or less"),
);

export const calendarRowSchema = z
  .object({
    run_id: text,
    course_id: text,
    run_title: text.optional(),
    date: dateString,
    delivery: lowerEnum(RUN_DELIVERIES),
    hours: positiveNumber.optional(),
    speakers: smallCount.optional(),
    cost_per_run: nonNegative.optional(),
    cost_per_head: nonNegative.optional(),
    min_pax: positiveInt,
    max_pax: positiveInt,
    expected_pax: positiveInt.optional(),
  })
  .superRefine((run, ctx) => {
    if (run.max_pax < run.min_pax) {
      ctx.addIssue({ code: "custom", path: ["max_pax"], message: "must be at least min_pax" });
    }
    if (run.expected_pax !== undefined && (run.expected_pax < run.min_pax || run.expected_pax > run.max_pax)) {
      ctx.addIssue({ code: "custom", path: ["expected_pax"], message: "must be between min_pax and max_pax" });
    }
    if (run.delivery === "external" && run.cost_per_head === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["cost_per_head"],
        message: "is required for external trainings (the fee per participant)",
      });
    }
  });

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type CalendarRow = z.infer<typeof calendarRowSchema>;
export type RosterRow = z.infer<typeof rosterRowSchema>;
export type AttendanceRow = z.infer<typeof attendanceRowSchema>;
export type CatalogRow = z.infer<typeof catalogRowSchema>;
