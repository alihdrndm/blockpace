import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import { forecast } from "./forecast.js";
import {
  type Block,
  BlockSchema,
  type Snapshot,
  SnapshotSchema,
} from "./model.js";
import type { IsoDate } from "./plain-date.js";
import { buildInputs, caseAt, loadFixture } from "./testing/fixtures.js";

describe("WE3 forecast and risk", () => {
  const fixture = loadFixture("we3");

  it("WE3 per_night current shortfall is 8/11/16/7 per night", () => {
    const result = evaluate(buildInputs(fixture, caseAt(fixture.cases, 1)));
    expect(result.nights.map((n) => n.shortfallRooms)).toEqual([8, 11, 16, 7]);
  });

  for (const testCase of fixture.cases) {
    it(`WE3 ${testCase.name}`, () => {
      const result = evaluate(buildInputs(fixture, testCase));
      const expected = testCase.expected as {
        forecast: Record<string, number>;
      } & Record<string, unknown>;
      expect(result).toMatchObject({
        pickedUpRoomNights: expected.pickedUpRoomNights,
        shortfallRoomNights: expected.shortfallRoomNights,
        damagesMinor: expected.damagesMinor,
        riskLevel: expected.riskLevel,
      });
      expect(result.daysToCutoff).toBe(14);
      expect(result.forecast).toMatchObject({
        status: "ok",
        method: "linear-14d",
        referenceAsOf: "2026-09-22",
        ...expected.forecast,
      });
    });
  }
});

// A one-night block keeps the arithmetic easy to follow in the edge-case tests below.
const oneNight = (cutoffDate: string, contractedRooms = 100): Block =>
  BlockSchema.parse({
    currency: "USD",
    cutoffDate,
    terms: { basis: "cumulative", allowedAttritionPct: 0 },
    nights: [{ date: "2026-11-10", contractedRooms, rateMinor: 1000 }],
  });

const snap = (asOfDate: string, pickedUpRooms: number): Snapshot =>
  SnapshotSchema.parse({
    asOfDate,
    nights: [{ date: "2026-11-10", pickedUpRooms }],
  });

const today = (value: string) => value as IsoDate;

describe("forecast", () => {
  it("is unavailable with NO_SNAPSHOT when nothing was reported yet", () => {
    expect(
      forecast({
        block: oneNight("2026-10-20"),
        snapshots: [],
        today: today("2026-10-06"),
      }),
    ).toEqual({ status: "unavailable", reason: "NO_SNAPSHOT" });
  });

  it("is unavailable with PAST_CUTOFF on and after the cutoff date", () => {
    const input = {
      block: oneNight("2026-10-06"),
      snapshots: [snap("2026-10-01", 10)],
    };
    expect(forecast({ ...input, today: today("2026-10-06") })).toEqual({
      status: "unavailable",
      reason: "PAST_CUTOFF",
    });
  });

  it("is unavailable with INSUFFICIENT_HISTORY when only one snapshot exists", () => {
    expect(
      forecast({
        block: oneNight("2026-10-20"),
        snapshots: [snap("2026-10-06", 10)],
        today: today("2026-10-06"),
      }),
    ).toEqual({ status: "unavailable", reason: "INSUFFICIENT_HISTORY" });
  });

  it("uses the earliest snapshot inside the 14-day window as reference", () => {
    const result = forecast({
      block: oneNight("2026-10-20"),
      snapshots: [
        snap("2026-09-30", 10),
        snap("2026-09-25", 4),
        snap("2026-10-06", 20),
      ],
      today: today("2026-10-06"),
    });
    // 09-25 is 11 days before 10-06 and the earliest inside the window.
    expect(result).toMatchObject({ status: "ok", referenceAsOf: "2026-09-25" });
  });

  it("falls back to the closest earlier snapshot when none is inside the window", () => {
    const result = forecast({
      block: oneNight("2026-10-20"),
      snapshots: [
        snap("2026-08-01", 1),
        snap("2026-09-01", 4),
        snap("2026-10-06", 20),
      ],
      today: today("2026-10-06"),
    });
    expect(result).toMatchObject({ status: "ok", referenceAsOf: "2026-09-01" });
  });

  it("projects a straight line and rounds the gain down", () => {
    // Gain 7 in 3 days, 14 days to go: floor(7 * 14 / 3) = 32, so 20 + 32 = 52.
    const result = forecast({
      block: oneNight("2026-10-20"),
      snapshots: [snap("2026-10-03", 13), snap("2026-10-06", 20)],
      today: today("2026-10-06"),
    });
    expect(result).toMatchObject({
      status: "ok",
      projectedPickupRoomNights: 52,
    });
  });

  it("never projects above the contracted rooms", () => {
    const result = forecast({
      block: oneNight("2026-10-20", 30),
      snapshots: [snap("2026-10-05", 0), snap("2026-10-06", 25)],
      today: today("2026-10-06"),
    });
    expect(result).toMatchObject({
      status: "ok",
      projectedPickupRoomNights: 30,
    });
  });

  it("never projects below current pickup when pickup fell", () => {
    const result = forecast({
      block: oneNight("2026-10-20"),
      snapshots: [snap("2026-10-01", 40), snap("2026-10-06", 30)],
      today: today("2026-10-06"),
    });
    expect(result).toMatchObject({
      status: "ok",
      projectedPickupRoomNights: 30,
    });
  });

  it("agrees with evaluate on the same inputs", () => {
    const fixture = loadFixture("we3");
    const inputs = buildInputs(fixture, caseAt(fixture.cases, 1));
    expect(forecast(inputs)).toEqual(evaluate(inputs).forecast);
  });
});
