import {
  type Block,
  compareDates,
  type IsoDate,
  type Snapshot,
  tryParseIsoDate,
} from "@alihdrndm/blockpace-core";
import { parse } from "csv-parse/sync";
import { type FieldError, ProblemException } from "../errors/problem.js";

// CSV snapshot import: header `as_of_date,night,picked_up[,resold]` (any letter case, any
// column order), one row per night per as-of date. Every problem is collected and reported
// at once, with `path: "row <n>"` (the header is row 1), so a planner can fix the file in one go.

const REQUIRED = ["as_of_date", "night", "picked_up"] as const;
const OPTIONAL = ["resold"] as const;
const MAX_REPORTED_ERRORS = 100;
const WHOLE_NUMBER = /^\d+$/;

function invalid(errors: FieldError[]): ProblemException {
  const shown = errors.slice(0, MAX_REPORTED_ERRORS);
  return new ProblemException(
    422,
    "IMPORT_INVALID",
    "CSV import is invalid",
    `The file was rejected and nothing was saved: ${errors.length} problem${errors.length === 1 ? "" : "s"}.`,
    shown,
  );
}

const rowError = (row: number, code: string, message: string): FieldError => ({
  path: `row ${row}`,
  code,
  message,
});

/** Parses and fully validates the file; returns one snapshot per as-of date, oldest first. */
export function parseSnapshotCsv(
  file: Buffer | undefined,
  block: Pick<Block, "nights">,
  latestAllowed: IsoDate,
): Snapshot[] {
  if (file === undefined || file.length === 0) {
    throw invalid([
      {
        path: "file",
        code: "missing",
        message: "send the CSV as the multipart field `file`",
      },
    ]);
  }

  // info: true gives each record its physical line number, so "row <n>" points at the line a
  // planner sees in a spreadsheet even when blank lines were skipped.
  let rows: { cells: string[]; line: number }[];
  try {
    // csv-parse's types do not model the `info: true` record shape, hence the cast.
    const records = parse(file, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      info: true,
    }) as unknown as { record: string[]; info: { lines: number } }[];
    rows = records.map((r) => ({ cells: r.record, line: r.info.lines }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "not a readable CSV file";
    throw invalid([{ path: "file", code: "unreadable", message }]);
  }

  const headerLine = rows[0]?.line ?? 1;
  const header = (rows[0]?.cells ?? []).map((name) => name.toLowerCase());
  const headerErrors: FieldError[] = [];
  for (const name of REQUIRED) {
    if (!header.includes(name))
      headerErrors.push(
        rowError(headerLine, "missing_column", `missing column ${name}`),
      );
  }
  for (const name of header) {
    if (![...REQUIRED, ...OPTIONAL].includes(name as never)) {
      headerErrors.push(
        rowError(
          headerLine,
          "unknown_column",
          `unknown column ${name || "(empty)"}`,
        ),
      );
    }
  }
  if (new Set(header).size !== header.length) {
    headerErrors.push(
      rowError(headerLine, "duplicate_column", "a column name appears twice"),
    );
  }
  if (headerErrors.length > 0) throw invalid(headerErrors);
  if (rows.length < 2)
    throw invalid([
      rowError(headerLine, "empty", "the file has a header but no data rows"),
    ]);

  const column = (name: string) => header.indexOf(name);
  const contracted = new Map(
    block.nights.map((n) => [n.date, n.contractedRooms]),
  );
  const errors: FieldError[] = [];
  const groups = new Map<
    IsoDate,
    { firstRow: number; nights: Snapshot["nights"] }
  >();
  const seen = new Set<string>();

  rows.slice(1).forEach(({ cells, line: row }) => {
    if (cells.length !== header.length) {
      errors.push(
        rowError(
          row,
          "column_count",
          `expected ${header.length} cells, found ${cells.length}`,
        ),
      );
      return;
    }
    const cell = (name: string) =>
      column(name) === -1 ? "" : (cells[column(name)] ?? "");

    const asOf = tryParseIsoDate(cell("as_of_date"));
    const night = tryParseIsoDate(cell("night"));
    const pickedText = cell("picked_up");
    const resoldText = cell("resold") === "" ? "0" : cell("resold");
    const before = errors.length;

    if (asOf === undefined)
      errors.push(
        rowError(
          row,
          "invalid_date",
          "as_of_date must be a real date (YYYY-MM-DD)",
        ),
      );
    else if (compareDates(asOf, latestAllowed) > 0) {
      errors.push(
        rowError(
          row,
          "in_future",
          `as_of_date ${asOf} is later than ${latestAllowed} (today + 1 day)`,
        ),
      );
    }
    if (night === undefined)
      errors.push(
        rowError(row, "invalid_date", "night must be a real date (YYYY-MM-DD)"),
      );
    else if (!contracted.has(night))
      errors.push(
        rowError(
          row,
          "unknown_night",
          `${night} is not one of the block's nights`,
        ),
      );
    if (!WHOLE_NUMBER.test(pickedText) || Number(pickedText) > 10_000) {
      errors.push(
        rowError(
          row,
          "invalid_number",
          "picked_up must be a whole number from 0 to 10000",
        ),
      );
    }
    if (!WHOLE_NUMBER.test(resoldText)) {
      errors.push(
        rowError(
          row,
          "invalid_number",
          "resold must be a whole number of 0 or more",
        ),
      );
    } else if (
      night !== undefined &&
      Number(resoldText) > (contracted.get(night) ?? Number.POSITIVE_INFINITY)
    ) {
      errors.push(
        rowError(
          row,
          "resold_exceeds_contracted",
          `resold is more than the ${contracted.get(night)} contracted rooms on ${night}`,
        ),
      );
    }
    if (errors.length > before || asOf === undefined || night === undefined)
      return;

    const key = `${asOf}|${night}`;
    if (seen.has(key)) {
      errors.push(
        rowError(
          row,
          "duplicate_row",
          `${night} appears twice for as_of_date ${asOf}`,
        ),
      );
      return;
    }
    seen.add(key);
    const group = groups.get(asOf) ?? { firstRow: row, nights: [] };
    group.nights.push({
      date: night,
      pickedUpRooms: Number(pickedText),
      resoldRooms: Number(resoldText),
    });
    groups.set(asOf, group);
  });

  // Each as-of date must report every night of the block.
  for (const [asOf, group] of groups) {
    const reported = new Set(group.nights.map((n) => n.date));
    const missing = [...contracted.keys()]
      .filter((date) => !reported.has(date))
      .sort(compareDates);
    if (missing.length > 0) {
      errors.push(
        rowError(
          group.firstRow,
          "missing_nights",
          `as_of_date ${asOf} is missing nights: ${missing.join(", ")}`,
        ),
      );
    }
  }
  if (errors.length > 0) throw invalid(errors);

  return [...groups.entries()]
    .sort(([a], [b]) => compareDates(a, b))
    .map(([asOfDate, group]) => ({ asOfDate, nights: group.nights }));
}
