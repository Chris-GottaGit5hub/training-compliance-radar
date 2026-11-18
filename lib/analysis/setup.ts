import type { RulesConfig } from "@/lib/schemas";
import type { FileState } from "./files";
import { formatPesoMillions } from "./format";

/** The four upload slots (spec §2). */
export interface SetupFiles {
  roster: FileState<unknown>;
  attendance: FileState<unknown>;
  catalog: FileState<unknown>;
  calendar: FileState<unknown>;
}

const SLOTS = ["roster", "attendance", "catalog", "calendar"] as const;
const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("en-PH")} ${n === 1 ? one : many}`;
const rowsOf = (f: FileState<unknown>): number | null => (f.status === "ok" ? f.rows.length : null);

/** ₱100M for whole millions, ₱2.45M otherwise (below a million: the full peso amount). */
const budgetText = (php: number): string =>
  php >= 1_000_000 && php % 1_000_000 === 0 ? `₱${php / 1_000_000}M` : formatPesoMillions(php);

/** The two lines of the collapsed Data and Rules bar (spec §6, v2.10). */
export function setupSummary(files: SetupFiles, config: RulesConfig): { data: string; rules: string } {
  const parts: string[] = [];
  const add = (n: number | null, one: string, many: string) => {
    if (n !== null) parts.push(count(n, one, many));
  };
  add(rowsOf(files.roster), "employee", "employees");
  add(rowsOf(files.attendance), "attendance row", "attendance rows");
  add(rowsOf(files.catalog), "course", "courses");
  add(rowsOf(files.calendar), "calendar run", "calendar runs");

  const rules = [
    `As of ${config.asOfDate}`,
    `minimum ${config.minHours} ${config.minHours === 1 ? "hour" : "hours"}`,
    config.elearningCounts ? "e-learning counts" : "e-learning does not count",
    config.budgetPhp > 0 ? `budget ${budgetText(config.budgetPhp)}` : "no budget set",
  ];
  return { data: parts.join(" · "), rules: rules.join(" · ") };
}

/** Identifies the loaded files: a new or removed file gives a new key. */
export function filesKey(files: SetupFiles): string {
  return SLOTS.map((slot) => {
    const f = files[slot];
    return f.status === "empty" ? `${slot}:-` : `${slot}:${f.status}:${f.fileName}:${rowsOf(f) ?? "x"}`;
  }).join("|");
}

/**
 * Whether steps 1 and 2 are folded (spec §6, v2.10): only when everything is loaded, valid and
 * analyzed, and the user has not opened them for these same files.
 */
export function setupCollapsed(input: {
  ready: boolean;
  hasResults: boolean;
  ruleErrors: number;
  files: SetupFiles;
  sampleLoading: boolean;
  openedFor: string | null;
}): boolean {
  const fileError = SLOTS.some((slot) => input.files[slot].status === "error");
  if (!input.ready || !input.hasResults || input.ruleErrors > 0 || fileError || input.sampleLoading) return false;
  return input.openedFor !== filesKey(input.files);
}
