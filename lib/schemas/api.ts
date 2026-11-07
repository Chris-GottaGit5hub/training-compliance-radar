import { z } from "zod";
import { isRealDate } from "./dates";
import { PROVIDERS } from "./rows";

/** Limits from spec §5. */
export const API_LIMITS = {
  maxBodyBytes: 200 * 1024,
  maxUnits: 200,
  maxCatalog: 300,
  maxPositions: 5,
  maxCourses: 5,
  maxTopUnits: 10,
  maxCourseIds: 3,
  maxRationaleChars: 300,
  maxSummaryWords: 250,
  maxUnitChars: 100,
  maxPositionChars: 100,
  maxTitleChars: 200,
  maxSkillAreaChars: 100,
  /** A position is only sent when at least this many at-risk employees hold it. */
  minCellSize: 3,
} as const;

// Strict objects reject unknown keys, so a stray name or ID field can never pass validation.
const text = (max: number) => z.string().min(1).max(max);
const count = z.number().int().min(0).max(1_000_000);
const percent = z.number().min(0).max(100);
const isoDate = z.string().refine(isRealDate, "must be YYYY-MM-DD");
const months = z.number().int().min(0).max(12);
const unitName = text(API_LIMITS.maxUnitChars);

export const recommendRequestSchema = z.strictObject({
  units: z
    .array(
      z.strictObject({
        unit: unitName,
        atRiskLicensed: count,
        atRiskUnlicensed: count,
        topPositions: z.array(text(API_LIMITS.maxPositionChars)).max(API_LIMITS.maxPositions),
      }),
    )
    .min(1)
    .max(API_LIMITS.maxUnits),
  catalog: z
    .array(
      z.strictObject({
        courseId: text(60),
        title: text(API_LIMITS.maxTitleChars),
        skillArea: text(API_LIMITS.maxSkillAreaChars),
        durationMinutes: z.number().int().positive().max(100_000),
        provider: z.enum(PROVIDERS),
      }),
    )
    .min(1)
    .max(API_LIMITS.maxCatalog),
});

export const memoRequestSchema = z.strictObject({
  unit: unitName,
  atRiskCount: count,
  coveredCount: count,
  deadline: isoDate,
  monthsRemaining: months,
  courses: z
    .array(
      z.strictObject({
        title: text(API_LIMITS.maxTitleChars),
        url: z.url({ protocol: /^https$/ }).max(500).optional(),
        durationMinutes: z.number().int().positive().max(100_000),
      }),
    )
    .max(API_LIMITS.maxCourses),
  tone: z.enum(["formal", "friendly"]),
});

export const summaryRequestSchema = z.strictObject({
  asOfDate: isoDate,
  covered: count,
  compliant: count,
  atRisk: count,
  exempt: count,
  excluded: count,
  notCovered: count,
  complianceRate: percent,
  monthsRemaining: months,
  deadline: isoDate,
  topUnits: z
    .array(
      z.strictObject({
        unit: unitName,
        covered: count,
        compliant: count,
        atRisk: count,
        complianceRate: percent,
      }),
    )
    .max(API_LIMITS.maxTopUnits),
  costToClose: z.number().min(0).optional(),
  budgetPhp: z.number().min(0).optional(),
});

/** What the model is asked to return (validated by the SDK). */
export const recommendModelSchema = z.object({
  recommendations: z.array(
    z.object({ unit: z.string(), courseIds: z.array(z.string()), rationale: z.string() }),
  ),
});
export const memoModelSchema = z.object({ subject: z.string().min(1), body: z.string().min(1) });
export const summaryModelSchema = z.object({ summary: z.string().min(1) });

const warning = z.literal("unverified_numbers").optional();

/** What the routes return (spec §3.4). */
export const recommendResponseSchema = z.object({
  recommendations: z.array(
    z.object({
      unit: z.string(),
      courseIds: z.array(z.string()).max(API_LIMITS.maxCourseIds),
      rationale: z.string().max(API_LIMITS.maxRationaleChars),
      fallbackSearch: z.boolean(),
    }),
  ),
});
export const memoResponseSchema = z.object({ subject: z.string(), body: z.string(), warning });
export const summaryResponseSchema = z.object({ summary: z.string(), warning });

export type RecommendRequest = z.infer<typeof recommendRequestSchema>;
export type MemoRequest = z.infer<typeof memoRequestSchema>;
export type SummaryRequest = z.infer<typeof summaryRequestSchema>;
export type RecommendResponse = z.infer<typeof recommendResponseSchema>;
export type MemoResponse = z.infer<typeof memoResponseSchema>;
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;
