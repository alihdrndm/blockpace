import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDates,
  diffDays,
  eachNight,
  type IsoDate,
  parseIsoDate,
  tryParseIsoDate,
} from "./plain-date.js";

const d = (value: string) => value as IsoDate;

describe("plain-date", () => {
  it("parseIsoDate accepts real dates and rejects impossible or malformed ones", () => {
    expect(parseIsoDate("2026-02-28")).toBe("2026-02-28");
    expect(parseIsoDate("2028-02-29")).toBe("2028-02-29");
    expect(() => parseIsoDate("2026-02-30")).toThrow(/Invalid calendar date/);
    expect(() => parseIsoDate("2026-13-01")).toThrow();
    expect(() => parseIsoDate("2026-1-1")).toThrow();
    expect(() => parseIsoDate("2026-10-06T00:00:00Z")).toThrow();
    expect(tryParseIsoDate("nope")).toBeUndefined();
  });

  it("addDays crosses month, year and leap-day boundaries", () => {
    expect(addDays(d("2026-10-31"), 1)).toBe("2026-11-01");
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(d("2026-03-01"), -1)).toBe("2026-02-28");
  });

  it("diffDays is a minus b and ignores daylight saving changes", () => {
    expect(diffDays(d("2026-10-20"), d("2026-10-06"))).toBe(14);
    expect(diffDays(d("2026-10-06"), d("2026-10-20"))).toBe(-14);
    expect(diffDays(d("2026-11-02"), d("2026-10-31"))).toBe(2);
    expect(diffDays(d("2026-03-30"), d("2026-03-28"))).toBe(2);
  });

  it("compareDates orders chronologically", () => {
    expect(compareDates(d("2026-01-01"), d("2026-01-02"))).toBe(-1);
    expect(compareDates(d("2026-01-02"), d("2026-01-01"))).toBe(1);
    expect(compareDates(d("2026-01-01"), d("2026-01-01"))).toBe(0);
  });

  it("eachNight lists consecutive nights from the first", () => {
    expect(eachNight(d("2026-11-10"), 4)).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
  });
});
