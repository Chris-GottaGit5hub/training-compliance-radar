import { CSV_LIMITS, type CsvIssue, type CsvResult } from "@/lib/schemas/csv";

export type FileState<T> =
  | { status: "empty" }
  | { status: "ok"; fileName: string; rows: T[]; warnings: string[] }
  | { status: "error"; fileName: string; errors: CsvIssue[]; totalErrors: number };

export const EMPTY_FILE = { status: "empty" } as const;

/** Turns a `validateCsv` result into the state the upload boxes render. */
export function stateFromResult<T>(result: CsvResult<T>, fileName: string): FileState<T> {
  return result.ok
    ? { status: "ok", fileName, rows: result.rows, warnings: result.warnings }
    : { status: "error", fileName, errors: result.errors, totalErrors: result.totalErrors };
}

/** Checked before reading the file, so a huge file is never loaded into memory. */
export function oversizedState(fileName: string): FileState<never> {
  return {
    status: "error",
    fileName,
    errors: [{ row: null, message: "File is larger than 5 MB." }],
    totalErrors: 1,
  };
}

export const isOversized = (sizeBytes: number): boolean => sizeBytes > CSV_LIMITS.maxBytes;
