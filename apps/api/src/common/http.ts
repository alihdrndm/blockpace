import { encodeCursor } from "@alihdrndm/blockpace-core";

/** RFC 3339 in UTC without fractional seconds, e.g. 2026-10-05T13:02:11Z. */
export const toTimestamp = (date: Date): string =>
  date.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Turns `limit + 1` rows (newest first) into a page. Fetching one extra row is how we know
 * whether there is a next page without a separate count query.
 */
export function toPage<Row extends { id: string }, Item>(
  rows: Row[],
  limit: number,
  toItem: (row: Row) => Item,
): { items: Item[]; nextCursor?: string } {
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map(toItem),
    ...(rows.length > limit && last !== undefined
      ? { nextCursor: encodeCursor(last.id) }
      : {}),
  };
}
