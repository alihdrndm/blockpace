// All money and room-night arithmetic is done with BigInt so nothing is ever rounded
// by floating point. Money is rounded once, at the end of each formula.

export type MinimumRounding = "ceil" | "floor" | "round";

export const BPS = 10_000n;

/** Percentage (at most 2 decimals) to basis points, e.g. 12.5 -> 1250n. */
export function toBps(pct: number): bigint {
  return BigInt(Math.round(pct * 100));
}

/** Integer division rounding half up. Both arguments must be non-negative. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Rounds numerator / denominator to whole rooms using the contract's rounding rule. */
export function roundMinimum(
  numerator: bigint,
  denominator: bigint,
  mode: MinimumRounding,
): bigint {
  if (mode === "floor") return numerator / denominator;
  if (mode === "ceil") return (numerator + denominator - 1n) / denominator;
  return divRoundHalfUp(numerator, denominator);
}

/** Converts back to a JS number for the result object, refusing values that would lose precision. */
export function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`Value ${value} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return Number(value);
}

export const bigMin = (a: bigint, b: bigint): bigint => (a < b ? a : b);
export const bigMax = (a: bigint, b: bigint): bigint => (a > b ? a : b);
