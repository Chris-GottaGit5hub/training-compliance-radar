/** Today's date in the Philippines (UTC+8) as YYYY-MM-DD. */
export function todayManila(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Compliance deadline: Dec 31 of the year. */
export function deadlineOf(year: number): string {
  return `${year}-12-31`;
}

/** Whole months from asOfDate to Dec 31: 12 - month (Jan -> 11, Sep -> 3, Dec -> 0). */
export function monthsRemaining(asOfDate: string): number {
  return 12 - Number(asOfDate.slice(5, 7));
}
