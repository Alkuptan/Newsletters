/**
 * Calendar-day arithmetic for the newsletter.
 *
 * Every date on the dashboard is a whole day — the sheet stores midnight
 * timestamps and the newsletter never shows a time. Differences are therefore
 * taken between UTC midnights, so a daylight-saving boundary can never make a
 * duration come out one day short.
 */

/** Midnight UTC on the same calendar day as `date`, in local terms. */
function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The calendar date as `YYYY-MM-DD`, read in local terms.
 *
 * NEVER use `toISOString()` on a sheet date. Excel dates arrive as local
 * midnight, and Egypt is ahead of UTC, so `toISOString()` rolls 29 April back
 * to 28 April — every date on every newsletter would be a day early.
 */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parse a `YYYY-MM-DD` calendar date to local midnight. */
export function fromIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Strip any time component, keeping the calendar day the reader would see.
 *
 * Sheet cells are meant to be whole days but a stray time slips in now and
 * again; left alone it makes a duration come out a day short.
 */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * `n` calendar days after `date` (or before, for a negative `n`).
 *
 * Built from the local calendar fields rather than by adding milliseconds, so a
 * daylight-saving change cannot land the result on the wrong day.
 */
export function addCalendarDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/**
 * Whole calendar days from `from` to `to`. Negative when `to` precedes `from`.
 *
 * This is a plain difference, not an inclusive count: 16 Jun → 15 Aug is 60,
 * which is what the supplied Ancient Hill 56 newsletter shows for its duration.
 */
export function diffCalendarDays(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / MS_PER_DAY);
}

/** The earliest of the given dates, ignoring nulls. */
export function earliest(dates: readonly (Date | null)[]): Date | null {
  const present = dates.filter((d): d is Date => d !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (b.getTime() < a.getTime() ? b : a));
}

/** The latest of the given dates, ignoring nulls. */
export function latest(dates: readonly (Date | null)[]): Date | null {
  const present = dates.filter((d): d is Date => d !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The big day number on a calendar card, e.g. "29". */
export function formatCardDay(date: Date): string {
  return String(date.getDate());
}

/** The small line under it, e.g. "Apr 2026". */
export function formatCardMonthYear(date: Date): string {
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** The footer date, e.g. "08 July 2026". */
export function formatFooterDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** A Gantt bar's label, e.g. "Mar 30 - Apr 28". */
export function formatBarRange(from: Date, to: Date): string {
  return `${MONTHS_SHORT[from.getMonth()]} ${from.getDate()} - ${MONTHS_SHORT[to.getMonth()]} ${to.getDate()}`;
}

/** A month ruler column's label, e.g. "Mar". `month` is 0-based. */
export function monthShortName(month: number): string {
  return MONTHS_SHORT[((month % 12) + 12) % 12];
}
