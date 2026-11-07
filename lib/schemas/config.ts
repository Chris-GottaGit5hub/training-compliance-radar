import { z } from "zod";
import { isRealDate, isWithinYear } from "./dates";
import { EMPLOYMENT_TYPES } from "./rows";

const dateField = z
  .string()
  .refine(isRealDate, "must be a real date written as YYYY-MM-DD");

export const rulesConfigSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    asOfDate: dateField,
    lateHireCutoff: dateField,
    coveredTypes: z.array(z.enum(EMPLOYMENT_TYPES)).min(1, "pick at least one type"),
    elearningCounts: z.boolean(),
    minHours: z.number().min(0),
    budgetPhp: z.number().min(0),
  })
  .superRefine((config, ctx) => {
    for (const field of ["asOfDate", "lateHireCutoff"] as const) {
      const value = config[field];
      if (isRealDate(value) && !isWithinYear(value, config.year)) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `must fall within ${config.year}`,
        });
      }
    }
  });

export type RulesConfig = z.infer<typeof rulesConfigSchema>;

/** Spec §2.4 defaults. `today` is YYYY-MM-DD in Asia/Manila (see engine `todayManila`). */
export function defaultRulesConfig(today: string): RulesConfig {
  const year = Number(today.slice(0, 4));
  return {
    year,
    asOfDate: today,
    lateHireCutoff: `${year}-10-01`,
    coveredTypes: [...EMPLOYMENT_TYPES],
    elearningCounts: true,
    minHours: 1,
    budgetPhp: 0,
  };
}
