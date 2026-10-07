import type { Block, Snapshot } from "./model.js";
import {
  BPS,
  bigMax,
  bigMin,
  divRoundHalfUp,
  roundMinimum,
  toBps,
} from "./money.js";
import { compareDates, type IsoDate } from "./plain-date.js";

// Shared arithmetic for evaluate (current pickup) and forecast (projected pickup),
// so each formula from HANDOFF.md exists exactly once.

export interface NightFigures {
  date: IsoDate;
  contracted: bigint;
  rate: bigint;
}

export interface Outcome {
  contractedRoomNights: bigint;
  minimumRoomNights: bigint;
  pickedUpRoomNights: bigint;
  shortfallBeforeCredit: bigint;
  resellCredited: bigint;
  shortfallRoomNights: bigint;
  damagesMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  /** Per-night minimum and shortfall (after credit); empty on the cumulative basis. */
  perNight: { minimumRooms: bigint; shortfallRooms: bigint }[];
}

/** Block nights in date order; the library sorts because callers may send them in any order. */
export function sortedNights(block: Pick<Block, "nights">): NightFigures[] {
  return [...block.nights]
    .sort((a, b) => compareDates(a.date, b.date))
    .map((n) => ({
      date: n.date,
      contracted: BigInt(n.contractedRooms),
      rate: BigInt(n.rateMinor),
    }));
}

/** The snapshot with the greatest asOfDate on or before `today`, if any. */
export function pickSnapshot(
  snapshots: Snapshot[],
  today: IsoDate,
): Snapshot | undefined {
  let best: Snapshot | undefined;
  for (const snapshot of snapshots) {
    if (compareDates(snapshot.asOfDate, today) > 0) continue;
    if (
      best === undefined ||
      compareDates(snapshot.asOfDate, best.asOfDate) > 0
    ) {
      best = snapshot;
    }
  }
  return best;
}

/** Pickup and resold per night (aligned with `nights`) from a snapshot; zeros when there is none. */
export function figuresFromSnapshot(
  nights: NightFigures[],
  snapshot: Snapshot | undefined,
): { pickups: bigint[]; resold: bigint[] } {
  if (snapshot === undefined) {
    return { pickups: nights.map(() => 0n), resold: nights.map(() => 0n) };
  }
  const byDate = new Map(snapshot.nights.map((n) => [n.date, n]));
  const row = (date: IsoDate) => {
    const found = byDate.get(date);
    if (found === undefined)
      throw new Error(`Snapshot ${snapshot.asOfDate} has no night ${date}`);
    return found;
  };
  return {
    pickups: nights.map((n) => BigInt(row(n.date).pickedUpRooms)),
    resold: nights.map((n) => BigInt(row(n.date).resoldRooms)),
  };
}

const sum = (values: bigint[]): bigint =>
  values.reduce((total, v) => total + v, 0n);

export function computeOutcome(
  block: Pick<Block, "terms">,
  nights: NightFigures[],
  pickups: bigint[],
  resold: bigint[],
): Outcome {
  const { terms } = block;
  const damagesBps = toBps(terms.damagesPct);
  const taxBps = toBps(terms.taxPct);
  const keepBps = BPS - toBps(terms.allowedAttritionPct);

  const contractedRoomNights = sum(nights.map((n) => n.contracted));
  if (contractedRoomNights === 0n)
    throw new Error("A block needs at least one contracted room");
  const pickedUpRoomNights = sum(pickups);

  let minimumRoomNights: bigint;
  let shortfallBeforeCredit: bigint;
  let resellCredited: bigint;
  let damagesMinor: bigint;
  let perNight: Outcome["perNight"] = [];

  if (terms.basis === "cumulative") {
    minimumRoomNights = roundMinimum(
      contractedRoomNights * keepBps,
      BPS,
      terms.minimumRounding,
    );
    shortfallBeforeCredit = bigMax(0n, minimumRoomNights - pickedUpRoomNights);
    resellCredited = terms.resellCredit
      ? bigMin(shortfallBeforeCredit, sum(resold))
      : 0n;
    const shortfall = shortfallBeforeCredit - resellCredited;
    // B1: the shortfall is charged at the contracted-room-weighted average rate.
    const weightedRevenue = sum(nights.map((n) => n.contracted * n.rate));
    damagesMinor = divRoundHalfUp(
      shortfall * weightedRevenue * damagesBps,
      contractedRoomNights * BPS,
    );
  } else {
    const before: bigint[] = [];
    const credit: bigint[] = [];
    perNight = nights.map((n, i) => {
      const minimumRooms = roundMinimum(
        n.contracted * keepBps,
        BPS,
        terms.minimumRounding,
      );
      const gap = bigMax(0n, minimumRooms - (pickups[i] as bigint));
      // B4: one resold room cancels one missing room, never more than the gap on that night.
      const credited = terms.resellCredit
        ? bigMin(gap, resold[i] as bigint)
        : 0n;
      before.push(gap);
      credit.push(credited);
      return { minimumRooms, shortfallRooms: gap - credited };
    });
    minimumRoomNights = sum(perNight.map((n) => n.minimumRooms));
    shortfallBeforeCredit = sum(before);
    resellCredited = sum(credit);
    const weightedShortfall = sum(
      perNight.map(
        (n, i) => n.shortfallRooms * (nights[i] as NightFigures).rate,
      ),
    );
    damagesMinor = divRoundHalfUp(weightedShortfall * damagesBps, BPS);
  }

  const taxMinor = divRoundHalfUp(damagesMinor * taxBps, BPS);
  return {
    contractedRoomNights,
    minimumRoomNights,
    pickedUpRoomNights,
    shortfallBeforeCredit,
    resellCredited,
    shortfallRoomNights: shortfallBeforeCredit - resellCredited,
    damagesMinor,
    taxMinor,
    totalMinor: damagesMinor + taxMinor,
    perNight,
  };
}
