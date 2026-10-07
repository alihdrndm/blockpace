import {
  computeOutcome,
  figuresFromSnapshot,
  type NightFigures,
  pickSnapshot,
  sortedNights,
} from "./calc.js";
import type { Block, Forecast, Snapshot } from "./model.js";
import { bigMax, bigMin, toSafeNumber } from "./money.js";
import { compareDates, diffDays, type IsoDate } from "./plain-date.js";

const WINDOW_DAYS = 14;

/**
 * Reference snapshot: the earliest one inside the 14 days before `latest`; failing that,
 * the closest one before it.
 */
function pickReference(
  snapshots: Snapshot[],
  latest: Snapshot,
): Snapshot | undefined {
  const earlier = snapshots.filter(
    (s) => compareDates(s.asOfDate, latest.asOfDate) < 0,
  );
  const inWindow = earlier
    .filter((s) => diffDays(latest.asOfDate, s.asOfDate) <= WINDOW_DAYS)
    .sort((a, b) => compareDates(a.asOfDate, b.asOfDate));
  if (inWindow[0] !== undefined) return inWindow[0];
  return earlier.sort((a, b) => compareDates(b.asOfDate, a.asOfDate))[0];
}

/** Method "linear-14d" (B6): continue each night's recent pickup gain in a straight line to cutoff. */
export function forecast(input: {
  block: Block;
  snapshots: Snapshot[];
  today: IsoDate;
}): Forecast {
  const { block, snapshots, today } = input;
  const latest = pickSnapshot(snapshots, today);
  if (latest === undefined)
    return { status: "unavailable", reason: "NO_SNAPSHOT" };

  const daysToCutoff = diffDays(block.cutoffDate, today);
  if (daysToCutoff <= 0)
    return { status: "unavailable", reason: "PAST_CUTOFF" };

  const reference = pickReference(snapshots, latest);
  if (reference === undefined)
    return { status: "unavailable", reason: "INSUFFICIENT_HISTORY" };

  const nights: NightFigures[] = sortedNights(block);
  const now = figuresFromSnapshot(nights, latest);
  const before = figuresFromSnapshot(nights, reference);
  const span = BigInt(diffDays(latest.asOfDate, reference.asOfDate));
  const remaining = BigInt(daysToCutoff);

  const projected = nights.map((night, i) => {
    const current = now.pickups[i] as bigint;
    const gain = bigMax(0n, current - (before.pickups[i] as bigint));
    // Integer division floors; a night never forecasts above its contracted rooms or below today's pickup.
    return bigMax(
      current,
      bigMin(night.contracted, current + (gain * remaining) / span),
    );
  });

  const outcome = computeOutcome(block, nights, projected, now.resold);
  return {
    status: "ok",
    method: "linear-14d",
    referenceAsOf: reference.asOfDate,
    projectedPickupRoomNights: toSafeNumber(outcome.pickedUpRoomNights),
    projectedShortfallRoomNights: toSafeNumber(outcome.shortfallRoomNights),
    projectedDamagesMinor: toSafeNumber(outcome.damagesMinor),
    projectedTotalMinor: toSafeNumber(outcome.totalMinor),
  };
}
