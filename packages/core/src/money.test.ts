import { describe, expect, it } from "vitest";
import { divRoundHalfUp, roundMinimum, toBps, toSafeNumber } from "./money.js";

describe("money", () => {
  it("toBps converts percentages to integer basis points", () => {
    expect(toBps(12.5)).toBe(1250n);
    expect(toBps(0.29)).toBe(29n);
    expect(toBps(100)).toBe(10000n);
    expect(toBps(0)).toBe(0n);
  });

  it("divRoundHalfUp rounds .5 up and below .5 down", () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(7n, 3n)).toBe(2n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
    expect(divRoundHalfUp(0n, 7n)).toBe(0n);
    expect(divRoundHalfUp(9n, 3n)).toBe(3n);
  });

  it("roundMinimum applies ceil, floor and round for fractional minimums", () => {
    expect([
      roundMinimum(85n, 10n, "ceil"),
      roundMinimum(85n, 10n, "floor"),
    ]).toEqual([9n, 8n]);
    expect(roundMinimum(85n, 10n, "round")).toBe(9n);
    expect(roundMinimum(84n, 10n, "round")).toBe(8n);
  });

  it("roundMinimum leaves exact values alone", () => {
    for (const mode of ["ceil", "floor", "round"] as const) {
      expect(roundMinimum(80n, 10n, mode)).toBe(8n);
    }
  });

  it("toSafeNumber converts safe values and throws above MAX_SAFE_INTEGER", () => {
    expect(toSafeNumber(123n)).toBe(123);
    expect(toSafeNumber(BigInt(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => toSafeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      /MAX_SAFE_INTEGER/,
    );
  });
});
