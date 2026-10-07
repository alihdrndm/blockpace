import type { AttritionTerms, RiskLevel } from "@alihdrndm/blockpace-core";

// Pure display helpers shared by server and client components.

const currencyFormat = (currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency });

/**
 * How many decimal places the currency's minor unit has: 2 for USD (cents), 0 for JPY,
 * 3 for KWD. Taken from Intl rather than assumed, so any ISO currency is handled.
 * Throws RangeError for a code Intl does not know.
 */
export function minorUnitDigits(currency: string): number {
  return currencyFormat(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Money is stored in minor units; the browser formats it in the currency's own convention. */
export function formatMoney(minor: number, currency: string): string {
  return currencyFormat(currency).format(
    minor / 10 ** minorUnitDigits(currency),
  );
}

/** Percentages with at most two decimals and no trailing zeros: 15, 12.5, 64.25. */
export function formatPct(pct: number): string {
  return `${Number(pct.toFixed(2))}%`;
}

/** "in 14 days", "tomorrow", "today", "yesterday", "3 days ago". */
export function cutoffWording(daysToCutoff: number): string {
  if (daysToCutoff === 0) return "today";
  if (daysToCutoff === 1) return "tomorrow";
  if (daysToCutoff === -1) return "yesterday";
  return daysToCutoff > 0
    ? `in ${daysToCutoff} days`
    : `${-daysToCutoff} days ago`;
}

/** One sentence for the block header, e.g. "Cumulative basis · 15% allowed attrition · 80% damages". */
export function termsSentence(terms: AttritionTerms): string {
  const parts = [
    terms.basis === "cumulative" ? "Cumulative basis" : "Per-night basis",
    `${formatPct(terms.allowedAttritionPct)} allowed attrition`,
    `${formatPct(terms.damagesPct)} damages`,
  ];
  if (terms.taxPct > 0) parts.push(`${formatPct(terms.taxPct)} tax`);
  if (terms.resellCredit) parts.push("resell credit");
  return parts.join(" · ");
}

export interface BadgeStyle {
  label: string;
  /** A text symbol, so the level never depends on colour alone. */
  icon: string;
  className: string;
}

// Colours chosen for WCAG AA contrast (dark text on light tints).
export const RISK_BADGES: Record<RiskLevel, BadgeStyle> = {
  met: {
    label: "Minimum met",
    icon: "✓",
    className: "bg-green-100 text-green-900 ring-green-700",
  },
  on_track: {
    label: "On track",
    icon: "↗",
    className: "bg-sky-100 text-sky-900 ring-sky-700",
  },
  at_risk: {
    label: "At risk",
    icon: "!",
    className: "bg-amber-100 text-amber-950 ring-amber-700",
  },
  liable: {
    label: "Owes damages",
    icon: "✕",
    className: "bg-red-100 text-red-900 ring-red-700",
  },
};

/**
 * A typed amount in major units to minor units, exactly (string arithmetic, no floating point):
 * "189.5" USD is 18950, "1500" JPY is 1500, "1.250" KWD is 1250. Undefined if it is not an
 * amount with at most the currency's number of decimals.
 */
export function majorToMinor(
  value: string,
  currency: string,
): number | undefined {
  const digits = minorUnitDigits(currency);
  const match = /^(\d{1,9})(?:\.(\d+))?$/.exec(value.trim());
  if (match === null) return undefined;
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return undefined;
  return (
    Number(match[1]) * 10 ** digits +
    Number(fraction.padEnd(digits, "0") || "0")
  );
}

/** Minor units back to a major-unit input value: 18900 USD is "189.00". */
export function minorToMajor(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  if (digits === 0) return String(minor);
  const scale = 10 ** digits;
  return `${Math.floor(minor / scale)}.${String(minor % scale).padStart(digits, "0")}`;
}
