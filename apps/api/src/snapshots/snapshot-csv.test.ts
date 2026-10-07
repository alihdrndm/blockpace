import type { IsoDate } from "@alihdrndm/blockpace-core";
import { describe, expect, it } from "vitest";
import { ProblemException } from "../errors/problem.js";
import { parseSnapshotCsv } from "./snapshot-csv.js";

const block = {
  nights: [
    { date: "2026-11-10" as IsoDate, contractedRooms: 10, rateMinor: 100 },
    { date: "2026-11-11" as IsoDate, contractedRooms: 5, rateMinor: 100 },
  ],
};
const LATEST = "2026-10-07" as IsoDate;

const errorsOf = (csv: string | undefined) => {
  try {
    parseSnapshotCsv(
      csv === undefined ? undefined : Buffer.from(csv),
      block,
      LATEST,
    );
  } catch (error) {
    if (error instanceof ProblemException) {
      expect(error.code).toBe("IMPORT_INVALID");
      return error.errors ?? [];
    }
    throw error;
  }
  throw new Error("expected IMPORT_INVALID");
};

describe("parseSnapshotCsv (IMPORT_INVALID rules)", () => {
  it("groups rows by as_of_date, oldest first, defaulting resold to 0", () => {
    const csv =
      "as_of_date,night,picked_up\n2026-10-02,2026-11-10,1\n2026-10-02,2026-11-11,2\n2026-10-01,2026-11-10,3\n2026-10-01,2026-11-11,4\n";
    const result = parseSnapshotCsv(Buffer.from(csv), block, LATEST);
    expect(result.map((s) => s.asOfDate)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(result[0]?.nights[0]).toEqual({
      date: "2026-11-10",
      pickedUpRooms: 3,
      resoldRooms: 0,
    });
  });

  it("accepts a byte-order mark, blank lines and spaces around cells", () => {
    const csv =
      "﻿As_Of_Date , NIGHT , picked_up\n\n2026-10-01 , 2026-11-10 , 1\n2026-10-01,2026-11-11,2\n";
    expect(parseSnapshotCsv(Buffer.from(csv), block, LATEST)).toHaveLength(1);
  });

  it("IMPORT_INVALID header: missing, unknown and duplicate columns are row 1", () => {
    expect(errorsOf("as_of_date,night\n").map((e) => e.code)).toEqual([
      "missing_column",
    ]);
    expect(
      errorsOf("as_of_date,night,picked_up,extra\n").map((e) => e.code),
    ).toEqual(["unknown_column"]);
    expect(
      errorsOf("as_of_date,night,picked_up,NIGHT\n").map((e) => e.code),
    ).toContain("duplicate_column");
    expect(errorsOf("as_of_date,night,picked_up\n").map((e) => e.code)).toEqual(
      ["empty"],
    );
  });

  it("IMPORT_INVALID cells: each bad cell is reported with its row number", () => {
    const csv = [
      "as_of_date,night,picked_up,resold",
      "2026-02-30,2026-11-10,1,0",
      "2026-10-01,2026-12-01,1,0",
      "2026-10-01,2026-11-10,-1,0",
      "2026-10-01,2026-11-11,1,6",
      "2026-10-09,2026-11-10,1,0",
      "2026-10-01,2026-11-10",
    ].join("\n");
    const errors = errorsOf(csv);
    expect(errors.map((e) => `${e.path} ${e.code}`)).toEqual([
      "row 2 invalid_date",
      "row 3 unknown_night",
      "row 4 invalid_number",
      "row 5 resold_exceeds_contracted",
      "row 6 in_future",
      "row 7 column_count",
    ]);
  });

  it("IMPORT_INVALID groups: duplicate nights and as_of_date groups missing nights", () => {
    const csv =
      "as_of_date,night,picked_up\n2026-10-01,2026-11-10,1\n2026-10-01,2026-11-10,2\n";
    expect(errorsOf(csv).map((e) => `${e.path} ${e.code}`)).toEqual([
      "row 3 duplicate_row",
      "row 2 missing_nights",
    ]);
  });

  it("IMPORT_INVALID without a file or with an unreadable one", () => {
    expect(errorsOf(undefined)[0]?.path).toBe("file");
    expect(
      errorsOf('as_of_date,night,picked_up\n"unclosed,2026-11-10,1\n')[0]?.code,
    ).toBe("unreadable");
  });
});
