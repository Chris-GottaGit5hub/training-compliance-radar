import { defaultRulesConfig, isRealDate, rulesConfigSchema, type RulesConfig } from "@/lib/schemas";
import type { RosterRow } from "@/lib/schemas/rows";

/** Year of the latest hire date in the roster, or null for an empty roster. */
export function dataYear(roster: readonly RosterRow[]): number | null {
  let latest = "";
  for (const r of roster) if (r.hire_date > latest) latest = r.hire_date;
  return latest === "" ? null : Number(latest.slice(0, 4));
}

/** Annual allocation preset for the sample data, so the burn-down report has something to show. */
export const SAMPLE_BUDGET_PHP = 2_450_000;

/**
 * Default rules: sample data starts as of Sep 30 of the data year with a preset
 * annual budget; uploaded data uses today's date (Asia/Manila) and no budget per spec §2.4.
 */
export function initialConfigFor(
  source: "sample" | "upload",
  roster: readonly RosterRow[],
  today: string,
): RulesConfig {
  const year = dataYear(roster);
  return source === "sample" && year !== null
    ? { ...defaultRulesConfig(`${year}-09-30`), budgetPhp: SAMPLE_BUDGET_PHP }
    : defaultRulesConfig(today);
}

function shiftYear(date: string, year: number): string {
  if (!isRealDate(date)) return date;
  const shifted = `${year}-${date.slice(5)}`;
  return isRealDate(shifted) ? shifted : `${year}-02-28`; // Feb 29 in a non-leap year
}

/** Changes the year and moves asOfDate and lateHireCutoff into it, keeping month and day. */
export function withYear(config: RulesConfig, year: number): RulesConfig {
  if (!Number.isInteger(year)) return { ...config, year };
  return {
    ...config,
    year,
    asOfDate: shiftYear(config.asOfDate, year),
    lateHireCutoff: shiftYear(config.lateHireCutoff, year),
  };
}

/** Field name -> message for the first problem with each field; empty when the config is valid. */
export function configErrors(config: RulesConfig): Partial<Record<keyof RulesConfig, string>> {
  const errors: Partial<Record<keyof RulesConfig, string>> = {};
  const parsed = rulesConfigSchema.safeParse(config);
  if (parsed.success) return errors;
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof RulesConfig;
    if (errors[field]) continue;
    const value = config[field];
    errors[field] =
      typeof value === "number" && Number.isNaN(value) ? "Enter a number" : issue.message;
  }
  return errors;
}
