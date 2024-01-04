import {
  computeOutcome,
  figuresFromSnapshot,
  pickSnapshot,
  sortedNights,
} from "./calc.js";
import { forecast } from "./forecast.js";
import type { Block, Evaluation, EvaluationNight, Snapshot } from "./model.js";
import { divRoundHalfUp, toSafeNumber } from "./money.js";
import { diffDays, type IsoDate } from "./plain-date.js";
import { riskLevel } from "./risk.js";

export interface EvaluateInput {
  block: Block;
  snapshots: Snapshot[];
  /** Passed in, never read from the system clock, so results are reproducible. */
  today: IsoDate;
}

/** Pure: same input, same output; the input is never modified. */
export function evaluate(input: EvaluateInput): Evaluation {
  const { block, snapshots, today } = input;
  const nights = sortedNights(block);
  const snapshot = pickSnapshot(snapshots, today);
  const { pickups, resold } = figuresFromSnapshot(nights, snapshot);
  const outcome = computeOutcome(block, nights, pickups, resold);

  const perNight = block.terms.basis === "per_night";
  const nightRows: EvaluationNight[] = nights.map((night, i) => {
    const row: EvaluationNight = {
      date: night.date,
      contractedRooms: toSafeNumber(night.contracted),
      rateMinor: toSafeNumber(night.rate),
      pickedUpRooms: toSafeNumber(pickups[i] as bigint),
      resoldRooms: toSafeNumber(resold[i] as bigint),
    };
    const detail = outcome.perNight[i];
    if (perNight && detail !== undefined) {
      row.minimumRooms = toSafeNumber(detail.minimumRooms);
      row.shortfallRooms = toSafeNumber(detail.shortfallRooms);
    }
    return row;
  });

  const daysToCutoff = diffDays(block.cutoffDate, today);
  const projection = forecast(input);
  const shortfallRoomNights = toSafeNumber(outcome.shortfallRoomNights);

  const result: Evaluation = {
    asOf: today,
    currency: block.currency,
    basis: block.terms.basis,
    contractedRoomNights: toSafeNumber(outcome.contractedRoomNights),
    minimumRoomNights: toSafeNumber(outcome.minimumRoomNights),
    pickedUpRoomNights: toSafeNumber(outcome.pickedUpRoomNights),
    // Two decimals, computed in integers: P / B * 100 rounded half up.
    pickupPct:
      toSafeNumber(
        divRoundHalfUp(
          outcome.pickedUpRoomNights * 100n * 100n,
          outcome.contractedRoomNights,
        ),
      ) / 100,
    shortfallBeforeCredit: toSafeNumber(outcome.shortfallBeforeCredit),
    resellCredited: toSafeNumber(outcome.resellCredited),
    shortfallRoomNights,
    damagesMinor: toSafeNumber(outcome.damagesMinor),
    taxMinor: toSafeNumber(outcome.taxMinor),
    totalMinor: toSafeNumber(outcome.totalMinor),
    daysToCutoff,
    nights: nightRows,
    forecast: projection,
    riskLevel: riskLevel({
      shortfallRoomNights,
      daysToCutoff,
      forecast: projection,
    }),
  };
  if (snapshot !== undefined) result.snapshotAsOf = snapshot.asOfDate;
  return result;
}
