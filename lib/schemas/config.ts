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
    subscriptions: z.array(
      z.object({
        name: z.string().min(1),
        amountPhp: z.number().min(0, "must be 0 or more"),
      }),
    ),
    nominationReservePhp: z.number().min(0, "must be 0 or more").optional(),
    milestoneTargets: z
      .array(z.number().min(0, "must be 0 or more").max(100, "must be 100 or less"))
      .length(4, "enter four targets")
      .refine((t) => t.every((v, i) => i === 0 || v >= t[i - 1]), "targets must not decrease"),
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

/** Editable estimates of annual platform subscriptions, billed in January (spec §2.4). */
export const DEFAULT_SUBSCRIPTIONS: { name: string; amountPhp: number }[] = [
  { name: "Mentimeter (annual)", amountPhp: 12_000 },
  { name: "Kahoot! (annual)", amountPhp: 9_000 },
  { name: "Canva, 5 seats", amountPhp: 32_500 },
  { name: "Adobe Acrobat Pro, 3 seats", amountPhp: 40_500 },
];

/** Spec §2.4 defaults. `today` is YYYY-MM-DD in Asia/Manila (see engine `todayManila`). */
export function defaultRulesConfig(today: string): RulesConfig {
  const year = Number(today.slice(0, 4));
  return {
    year,
    asOfDate: today,
    lateHireCutoff: `${year}-10-01`,
    coveredTypes: ["regular"],
    elearningCounts: true,
    minHours: 1,
    budgetPhp: 0,
    subscriptions: DEFAULT_SUBSCRIPTIONS.map((s) => ({ ...s })),
    milestoneTargets: [25, 50, 85, 100],
  };
}
