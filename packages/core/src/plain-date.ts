// Calendar dates travel as "YYYY-MM-DD" strings; the brand stops a random string being used as one.
// Date objects appear only inside this file, always at UTC midnight, so time zones and
// daylight saving can never shift a date.
export type IsoDate = string & { readonly __brand: "IsoDate" };

const MS_PER_DAY = 86_400_000;
const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcMs(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10) as IsoDate;
}

/** Returns the date if `value` is a real calendar date, else undefined (so 2026-02-30 fails). */
export function tryParseIsoDate(value: string): IsoDate | undefined {
  if (!SHAPE.test(value)) return undefined;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return undefined;
  // Date.parse rolls 02-30 over to 03-02, so a round trip catches impossible dates.
  return fromUtcMs(ms) === value ? (value as IsoDate) : undefined;
}

export function parseIsoDate(value: string): IsoDate {
  const date = tryParseIsoDate(value);
  if (date === undefined) throw new Error(`Invalid calendar date: ${value}`);
  return date;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Whole days from `b` to `a` (a − b): positive when `a` is later. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / MS_PER_DAY);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** The `count` consecutive nights starting at `first`. */
export function eachNight(first: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}
