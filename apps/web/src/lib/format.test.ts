import { describe, expect, it } from "vitest";
import {
  cutoffWording,
  formatMoney,
  formatPct,
  majorToMinor,
  minorToMajor,
  minorUnitDigits,
  RISK_BADGES,
  termsSentence,
} from "./format";

describe("formatMoney", () => {
  it("formats minor units in the block's currency", () => {
    expect(formatMoney(97560, "USD")).toBe("$975.60");
    expect(formatMoney(152880, "USD")).toBe("$1,528.80");
    expect(formatMoney(105120, "USD")).toBe("$1,051.20");
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(formatMoney(123456, "EUR")).toBe("€1,234.56");
  });

  it("uses each currency's own minor unit: USD cents, JPY none, KWD fils", () => {
    expect(minorUnitDigits("USD")).toBe(2);
    expect(minorUnitDigits("JPY")).toBe(0);
    expect(minorUnitDigits("KWD")).toBe(3);
    expect(formatMoney(1500, "JPY")).toBe("¥1,500");
    // Intl separates the code with a non-breaking space.
    expect(formatMoney(1250, "KWD")).toMatch(/^KWD\s1\.250$/);
  });
});

describe("cutoffWording", () => {
  it("says how far away the cutoff is, in either direction", () => {
    expect(cutoffWording(14)).toBe("in 14 days");
    expect(cutoffWording(1)).toBe("tomorrow");
    expect(cutoffWording(0)).toBe("today");
    expect(cutoffWording(-1)).toBe("yesterday");
    expect(cutoffWording(-3)).toBe("3 days ago");
  });
});

describe("termsSentence", () => {
  it("matches the spec example", () => {
    expect(
      termsSentence({
        basis: "cumulative",
        allowedAttritionPct: 15,
        damagesPct: 80,
        taxPct: 0,
        resellCredit: false,
        minimumRounding: "ceil",
      }),
    ).toBe("Cumulative basis · 15% allowed attrition · 80% damages");
  });

  it("adds tax and resell credit only when they apply", () => {
    expect(
      termsSentence({
        basis: "per_night",
        allowedAttritionPct: 12.5,
        damagesPct: 100,
        taxPct: 12.5,
        resellCredit: true,
        minimumRounding: "ceil",
      }),
    ).toBe(
      "Per-night basis · 12.5% allowed attrition · 100% damages · 12.5% tax · resell credit",
    );
  });
});

describe("risk badges", () => {
  it("pair every level with text and an icon, never colour alone", () => {
    expect(RISK_BADGES.met.label).toBe("Minimum met");
    expect(RISK_BADGES.on_track.label).toBe("On track");
    expect(RISK_BADGES.at_risk.label).toBe("At risk");
    expect(RISK_BADGES.liable.label).toBe("Owes damages");
    for (const badge of Object.values(RISK_BADGES))
      expect(badge.icon.length).toBeGreaterThan(0);
  });
});

describe("money input", () => {
  it("parses major units exactly, without floating point", () => {
    expect(majorToMinor("189", "USD")).toBe(18900);
    expect(majorToMinor("189.5", "USD")).toBe(18950);
    expect(majorToMinor("219.00", "USD")).toBe(21900);
    expect(majorToMinor(" 0.07 ", "USD")).toBe(7);
  });

  it("follows the currency's decimals: JPY has none, KWD has three", () => {
    expect(majorToMinor("1500", "JPY")).toBe(1500);
    expect(majorToMinor("1500.5", "JPY")).toBeUndefined();
    expect(majorToMinor("1.25", "KWD")).toBe(1250);
    expect(majorToMinor("1.250", "KWD")).toBe(1250);
    expect(majorToMinor("1.2500", "KWD")).toBeUndefined();
  });

  it("rejects anything that is not a positive amount with at most the currency's decimals", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1,000"])
      expect(majorToMinor(bad, "USD")).toBeUndefined();
  });

  it("round-trips minor units back to an input value", () => {
    expect(minorToMajor(18900, "USD")).toBe("189.00");
    expect(minorToMajor(7, "USD")).toBe("0.07");
    expect(minorToMajor(1500, "JPY")).toBe("1500");
    expect(minorToMajor(1250, "KWD")).toBe("1.250");
  });

  it("formats percentages without trailing zeros", () => {
    expect(formatPct(15)).toBe("15%");
    expect(formatPct(64.5)).toBe("64.5%");
  });
});
