import type { AttritionTerms, RiskLevel } from "@alihdrndm/blockpace-core";

// Pure display helpers shared by server and client components.

/** Money is stored in minor units (cents); the browser formats it for people. */
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
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

/** "189" or "189.5" or "189.00" (major units) to 18900 minor units; undefined if not money. */
export function majorToMinor(value: string): number | undefined {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (match === null) return undefined;
  const whole = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * 100 + cents;
}

/** 18900 to "189.00", for prefilling major-unit inputs. */
export function minorToMajor(minor: number): string {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
