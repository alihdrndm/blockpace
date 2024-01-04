import type { IsoDate } from "@alihdrndm/blockpace-core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  alertEvents,
  blockNights,
  blocks,
  evaluations,
  snapshotNights,
  snapshots,
  webhookDeliveries,
  webhookEndpoints,
} from "./schema.js";
import { SEED_BLOCKS, SEED_ENDPOINT_ID, seed } from "./seed.js";
import { blockId, insertBlock, NOW, useTestDb } from "./testing/db.js";

const { db } = useTestDb();
const SEED_TODAY = "2026-10-06" as IsoDate;
const options = {
  today: SEED_TODAY,
  webhookUrl: "http://localhost:4999/",
  now: NOW,
};

const [HARBORVIEW, COURTYARD, LAKESIDE] = SEED_BLOCKS.map((b) => b.id) as [
  string,
  string,
  string,
];

interface StoredResult {
  riskLevel: string;
  shortfallRoomNights: number;
  damagesMinor: number;
  daysToCutoff: number;
  forecast: {
    referenceAsOf: string;
    projectedPickupRoomNights: number;
    projectedShortfallRoomNights: number;
    projectedDamagesMinor: number;
  };
}

const resultOf = async (id: string): Promise<StoredResult> => {
  const [row] = await db()
    .select()
    .from(evaluations)
    .where(eq(evaluations.blockId, id));
  if (!row) throw new Error(`no evaluation for ${id}`);
  return row.result as unknown as StoredResult;
};

// Everything that should be identical after a rerun. Generated alert ids and timestamps differ, so
// alerts are compared by what they say, not by id.
// created_at/updated_at are set by the database on every insert, so they are not part of "same data".
const withoutTimestamps = <T extends object>(rows: T[]) =>
  rows.map((row) => {
    const {
      createdAt: _c,
      updatedAt: _u,
      ...rest
    } = row as T & { createdAt?: Date; updatedAt?: Date };
    return rest;
  });

const snapshotOfData = async () => ({
  blocks: withoutTimestamps(
    await db().select().from(blocks).orderBy(blocks.id),
  ),
  nights: withoutTimestamps(
    await db()
      .select()
      .from(blockNights)
      .orderBy(blockNights.blockId, blockNights.night),
  ),
  snapshots: withoutTimestamps(
    await db().select().from(snapshots).orderBy(snapshots.id),
  ),
  snapshotNights: withoutTimestamps(
    await db()
      .select()
      .from(snapshotNights)
      .orderBy(snapshotNights.snapshotId, snapshotNights.night),
  ),
  endpoints: withoutTimestamps(await db().select().from(webhookEndpoints)),
  evaluations: (
    await db().select().from(evaluations).orderBy(evaluations.blockId)
  ).map((e) => ({
    blockId: e.blockId,
    evaluatedFor: e.evaluatedFor,
    riskLevel: e.riskLevel,
    result: e.result,
  })),
  alerts: (await db().select().from(alertEvents))
    .map((a) => `${a.blockId}|${a.type}|${a.dedupeKey}`)
    .sort(),
  deliveries: (await db().select().from(webhookDeliveries))
    .map((d) => `${d.endpointId}|${d.eventType}`)
    .sort(),
});

describe("seed", () => {
  it("with today 2026-10-06 gives on_track, at_risk and met", async () => {
    await seed(db(), options);
    expect((await resultOf(HARBORVIEW)).riskLevel).toBe("on_track");
    expect((await resultOf(COURTYARD)).riskLevel).toBe("at_risk");
    expect((await resultOf(LAKESIDE)).riskLevel).toBe("met");
  });

  it("the two TechConf blocks reproduce the WE3 numbers", async () => {
    await seed(db(), options);
    const cumulative = await resultOf(HARBORVIEW);
    expect(cumulative.daysToCutoff).toBe(14);
    expect(cumulative.forecast.referenceAsOf).toBe("2026-09-22");
    expect(cumulative.forecast.projectedPickupRoomNights).toBe(170);
    expect(cumulative.shortfallRoomNights).toBe(41);
    expect(cumulative.damagesMinor).toBe(666660);
    expect(cumulative.forecast.projectedShortfallRoomNights).toBe(0);
    expect(cumulative.forecast.projectedDamagesMinor).toBe(0);

    const perNight = await resultOf(COURTYARD);
    expect(perNight.shortfallRoomNights).toBe(42);
    expect(perNight.damagesMinor).toBe(690240);
    expect(perNight.forecast.projectedShortfallRoomNights).toBe(6);
    expect(perNight.forecast.projectedDamagesMinor).toBe(105120);
  });

  it("is idempotent: running it twice leaves the same data", async () => {
    await seed(db(), options);
    const first = await snapshotOfData();
    await seed(db(), options);
    expect(await snapshotOfData()).toEqual(first);
    expect(first.blocks).toHaveLength(3);
    expect(first.endpoints).toHaveLength(1);
    expect(first.endpoints[0]?.id).toBe(SEED_ENDPOINT_ID);
  });

  it("creates the sink endpoint and queues one delivery per alert", async () => {
    await seed(db(), options);
    const [endpoint] = await db().select().from(webhookEndpoints);
    expect(endpoint?.url).toBe("http://localhost:4999/");
    expect(endpoint?.secret).toBe("dev-secret-do-not-use");
    const alerts = await db().select().from(alertEvents);
    expect(alerts.length).toBeGreaterThan(0);
    expect(await db().select().from(webhookDeliveries)).toHaveLength(
      alerts.length,
    );
  });

  it("keeps deliveries queued for the seed endpoint by other blocks", async () => {
    await seed(db(), options);
    const deliveryId = blockId();
    await db().insert(webhookDeliveries).values({
      id: deliveryId,
      endpointId: SEED_ENDPOINT_ID,
      eventType: "PING",
      body: {},
      status: "pending",
      nextAttemptAt: NOW,
    });
    await seed(db(), options);
    const kept = await db()
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId));
    expect(kept).toHaveLength(1);
  });

  it("leaves blocks that are not seed data untouched", async () => {
    const mine = await insertBlock(db(), { id: blockId(), cutoffOffset: 10 });
    await seed(db(), options);
    await seed(db(), options);
    const rows = await db().select().from(blocks).where(eq(blocks.id, mine));
    expect(rows).toHaveLength(1);
    expect(await db().select().from(blocks)).toHaveLength(4);
  });
});
