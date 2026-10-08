import { describe, expect, it } from "vitest";
import {
  calculate,
  EXAMPLE,
  formatMoney,
  minorDigits,
  toMinor,
} from "./compute.js";

describe("calculate", () => {
  it("WE2: $975.60 cumulative and $1,528.80 per night", () => {
    const outcome = calculate(EXAMPLE);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    expect(outcome.cumulative.damagesMinor).toBe(97560);
    expect(outcome.perNight.damagesMinor).toBe(152880);
    expect(formatMoney(outcome.cumulative.totalMinor, "USD")).toBe("$975.60");
    expect(formatMoney(outcome.perNight.totalMinor, "USD")).toBe("$1,528.80");
    expect(outcome.perNight.nights.map((n) => n.shortfallRooms)).toEqual([
      0, 2, 7, 0,
    ]);
  });

  it("WE2b: resell credit lowers both bills", () => {
    const nights = EXAMPLE.nights.map((n) =>
      n.date === "2026-11-12" ? { ...n, resoldRooms: 3 } : n,
    );
    const outcome = calculate({ ...EXAMPLE, resellCredit: true, nights });
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    expect(outcome.cumulative.damagesMinor).toBe(48780);
    expect(outcome.perNight.damagesMinor).toBe(100320);
  });

  it("ignores resold rooms when resell credit is off", () => {
    const nights = EXAMPLE.nights.map((n) => ({ ...n, resoldRooms: 5 }));
    const outcome = calculate({ ...EXAMPLE, nights });
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    expect(outcome.cumulative.damagesMinor).toBe(97560);
  });

  it("explains invalid input instead of throwing", () => {
    const gap = {
      ...EXAMPLE,
      nights: [EXAMPLE.nights[0], EXAMPLE.nights[2]].flatMap((n) =>
        n ? [n] : [],
      ),
    };
    const notConsecutive = calculate(gap);
    expect(notConsecutive.ok).toBe(false);
    if (!notConsecutive.ok)
      expect(notConsecutive.problems.join()).toMatch(/consecutive/);

    expect(calculate({ ...EXAMPLE, allowedAttritionPct: 120 }).ok).toBe(false);
    expect(calculate({ ...EXAMPLE, currency: "dollars" }).ok).toBe(false);
    expect(calculate({ ...EXAMPLE, nights: [] }).ok).toBe(false);

    const tooManyResold = EXAMPLE.nights.map((n) => ({
      ...n,
      resoldRooms: 100,
    }));
    const resold = calculate({
      ...EXAMPLE,
      resellCredit: true,
      nights: tooManyResold,
    });
    expect(resold.ok).toBe(false);
  });
});

describe("money helpers", () => {
  it("use each currency's own minor unit", () => {
    expect(minorDigits("USD")).toBe(2);
    expect(minorDigits("JPY")).toBe(0);
    expect(minorDigits("KWD")).toBe(3);
    expect(minorDigits("not a currency")).toBe(2);
    expect(toMinor(189, "USD")).toBe(18900);
    expect(toMinor(189, "JPY")).toBe(189);
    expect(formatMoney(18900, "USD")).toBe("$189.00");
    expect(formatMoney(5, "XX")).toBe("XX 0.05");
  });
});
