import type { IsoDate } from "@alihdrndm/blockpace-core";
import { SEED_BLOCKS, seed } from "@alihdrndm/blockpace-db";
import { beforeAll, describe, expect, it } from "vitest";
import { API_KEY, TODAY, useTestApp } from "./support/app.js";

const { http, db } = useTestApp();
const get = (path: string) => http().get(path).set("x-api-key", API_KEY);

// Seed blocks reproduce WE3: Harborview = cumulative basis, Courtyard = per-night basis.
const HARBORVIEW = SEED_BLOCKS[0]?.id ?? "";
const COURTYARD = SEED_BLOCKS[1]?.id ?? "";
const MISSING = "01900000-0000-7000-8000-ffffffffffff";

beforeAll(async () => {
  await seed(db(), {
    today: TODAY as IsoDate,
    webhookUrl: "http://localhost:4999/",
  });
});

describe("GET /v1/blocks/:id/evaluation", () => {
  it("evaluates live for the clock's today (WE3 per-night numbers)", async () => {
    const { body } = await get(`/v1/blocks/${COURTYARD}/evaluation`).expect(
      200,
    );
    expect(body).toMatchObject({
      asOf: TODAY,
      snapshotAsOf: TODAY,
      shortfallRoomNights: 42,
      damagesMinor: 690240,
      riskLevel: "at_risk",
      forecast: {
        status: "ok",
        projectedShortfallRoomNights: 6,
        projectedDamagesMinor: 105120,
      },
    });
  });

  it("?asOf= evaluates as of an earlier date, using only snapshots up to it", async () => {
    const { body } = await get(
      `/v1/blocks/${HARBORVIEW}/evaluation?asOf=2026-09-29`,
    ).expect(200);
    expect(body).toMatchObject({
      asOf: "2026-09-29",
      snapshotAsOf: "2026-09-29",
      pickedUpRoomNights: 109,
    });
  });

  it("NOT_FOUND for an unknown block, VALIDATION_FAILED for a bad asOf", async () => {
    expect(
      (await get(`/v1/blocks/${MISSING}/evaluation`).expect(404)).body.code,
    ).toBe("NOT_FOUND");
    const bad = await get(
      `/v1/blocks/${HARBORVIEW}/evaluation?asOf=2026-02-30`,
    ).expect(422);
    expect(bad.body.errors[0].path).toBe("asOf");
  });
});

describe("GET /v1/blocks/:id/pace", () => {
  it("returns one point per snapshot, each evaluated as of its own date", async () => {
    const { body } = await get(`/v1/blocks/${HARBORVIEW}/pace`).expect(200);
    expect(body).toEqual({
      contractedRoomNights: 200,
      minimumRoomNights: 170,
      cutoffDate: "2026-10-20",
      points: [
        {
          asOfDate: "2026-09-22",
          pickedUpRoomNights: 88,
          pickupPct: 44,
          shortfallRoomNights: 82,
          totalMinor: 1333320,
        },
        {
          asOfDate: "2026-09-29",
          pickedUpRoomNights: 109,
          pickupPct: 54.5,
          shortfallRoomNights: 61,
          totalMinor: 991860,
        },
        {
          asOfDate: "2026-10-06",
          pickedUpRoomNights: 129,
          pickupPct: 64.5,
          shortfallRoomNights: 41,
          totalMinor: 666660,
        },
      ],
    });
  });

  it("NOT_FOUND for an unknown block", async () => {
    expect(
      (await get(`/v1/blocks/${MISSING}/pace`).expect(404)).body.code,
    ).toBe("NOT_FOUND");
  });
});
