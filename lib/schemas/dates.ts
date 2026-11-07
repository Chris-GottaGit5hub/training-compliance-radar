const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** True only for a real calendar date written as YYYY-MM-DD (no time zones). */
export function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** Dates are compared as plain strings; this checks `value` falls inside `year`. */
export function isWithinYear(value: string, year: number): boolean {
  return value >= `${year}-01-01` && value <= `${year}-12-31`;
}
