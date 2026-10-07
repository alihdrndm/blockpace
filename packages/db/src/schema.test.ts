import { sql } from "drizzle-orm";
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
import {
  blockId,
  insertBlock,
  insertEndpoint,
  insertSnapshot,
  NOW,
  TODAY,
  useTestDb,
} from "./testing/db.js";

const { db } = useTestDb();

// drizzle wraps driver errors; the Postgres message (with the constraint name) is on the cause.
const failureOf = async (action: Promise<unknown>): Promise<string> => {
  try {
    await action;
  } catch (error) {
    const cause = (error as { cause?: Error }).cause;
    return `${(error as Error).message} ${cause?.message ?? ""}`;
  }
  throw new Error("expected the statement to fail");
};

const validBlock = (id: string) => ({
  id,
  name: "n",
  hotelName: "h",
  currency: "USD",
  startDate: TODAY,
  endDate: TODAY,
  cutoffDate: TODAY,
  status: "active",
  basis: "cumulative",
  allowedAttritionBps: 1500,
  damagesBps: 10000,
  taxBps: 0,
  resellCredit: false,
  minimumRounding: "ceil",
});

describe("check constraints", () => {
  it("reject unknown values in enumerated text columns", async () => {
    const id = blockId();
    expect(
      await failureOf(
        db()
          .insert(blocks)
          .values({ ...validBlock(id), status: "open" }),
      ),
    ).toMatch(/blocks_status_check/);
    expect(
      await failureOf(
        db()
          .insert(blocks)
          .values({ ...validBlock(id), basis: "weekly" }),
      ),
    ).toMatch(/blocks_basis_check/);
    expect(
      await failureOf(
        db()
          .insert(blocks)
          .values({ ...validBlock(id), minimumRounding: "up" }),
      ),
    ).toMatch(/blocks_minimum_rounding_check/);
    expect(
      await failureOf(
        db()
          .insert(blocks)
          .values({ ...validBlock(id), allowedAttritionBps: 10001 }),
      ),
    ).toMatch(/blocks_allowed_attrition_bps_check/);
    expect(
      await failureOf(
        db()
          .insert(blocks)
          .values({ ...validBlock(id), taxBps: 5001 }),
      ),
    ).toMatch(/blocks_tax_bps_check/);
  });

  it("reject bad snapshot source, risk level and delivery status", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 10 });
    expect(
      await failureOf(
        db().insert(snapshots).values({
          id: blockId(),
          blockId: id,
          asOfDate: TODAY,
          source: "fax",
        }),
      ),
    ).toMatch(/snapshots_source_check/);
    expect(
      await failureOf(
        db().insert(evaluations).values({
          id: blockId(),
          blockId: id,
          evaluatedFor: TODAY,
          riskLevel: "fine",
          result: {},
        }),
      ),
    ).toMatch(/evaluations_risk_level_check/);
    const endpoint = await insertEndpoint(db());
    expect(
      await failureOf(
        db().insert(webhookDeliveries).values({
          id: blockId(),
          endpointId: endpoint,
          eventType: "PING",
          body: {},
          status: "queued",
          nextAttemptAt: NOW,
        }),
      ),
    ).toMatch(/webhook_deliveries_status_check/);
  });
});

describe("unique constraints and keys", () => {
  it("allow one snapshot per block per as-of date", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 10 });
    await insertSnapshot(db(), id, 3, 10);
    expect(await failureOf(insertSnapshot(db(), id, 3, 20))).toMatch(
      /snapshots_block_id_as_of_date_unique/,
    );
  });

  it("allow one evaluation per block per day", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 10 });
    const row = {
      blockId: id,
      evaluatedFor: TODAY,
      riskLevel: "met",
      result: {},
    };
    await db()
      .insert(evaluations)
      .values({ id: blockId(), ...row });
    expect(
      await failureOf(
        db()
          .insert(evaluations)
          .values({ id: blockId(), ...row }),
      ),
    ).toMatch(/evaluations_block_id_evaluated_for_unique/);
  });

  it("allow one alert per block, type and dedupe key", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 10 });
    const row = {
      blockId: id,
      type: "SNAPSHOT_STALE",
      dedupeKey: "k",
      payload: {},
    };
    await db()
      .insert(alertEvents)
      .values({ id: blockId(), ...row });
    expect(
      await failureOf(
        db()
          .insert(alertEvents)
          .values({ id: blockId(), ...row }),
      ),
    ).toMatch(/alert_events_block_id_type_dedupe_key_unique/);
  });

  it("allow one row per night in a block and in a snapshot", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 10 });
    const [night] = await db().select().from(blockNights);
    if (!night) throw new Error("block has no night");
    expect(await failureOf(db().insert(blockNights).values(night))).toMatch(
      /block_nights_pkey/,
    );

    await insertSnapshot(db(), id, 1, 10);
    const [snapshotNight] = await db().select().from(snapshotNights);
    if (!snapshotNight) throw new Error("snapshot has no night");
    expect(
      await failureOf(db().insert(snapshotNights).values(snapshotNight)),
    ).toMatch(/snapshot_nights_pkey/);
  });
});

describe("cascades", () => {
  it("deleting a block removes its nights, snapshots, evaluations, alerts and deliveries", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 10 });
    const endpoint = await insertEndpoint(db());
    await insertSnapshot(db(), id, 1, 10);
    const alertId = blockId();
    await db().insert(evaluations).values({
      id: blockId(),
      blockId: id,
      evaluatedFor: TODAY,
      riskLevel: "met",
      result: {},
    });
    await db().insert(alertEvents).values({
      id: alertId,
      blockId: id,
      type: "X",
      dedupeKey: "k",
      payload: {},
    });
    await db().insert(webhookDeliveries).values({
      id: blockId(),
      endpointId: endpoint,
      alertEventId: alertId,
      eventType: "X",
      body: {},
      status: "pending",
      nextAttemptAt: NOW,
    });

    await db().delete(blocks);

    for (const table of [
      "block_nights",
      "snapshots",
      "snapshot_nights",
      "evaluations",
      "alert_events",
      "webhook_deliveries",
    ]) {
      const result = await db().execute(
        sql.raw(`select count(*)::int as n from ${table}`),
      );
      expect(result.rows[0]?.n, table).toBe(0);
    }
    // The endpoint belongs to no block, so it stays.
    expect(await db().select().from(webhookEndpoints)).toHaveLength(1);
  });

  it("deleting an endpoint removes its deliveries", async () => {
    const endpoint = await insertEndpoint(db());
    await db().insert(webhookDeliveries).values({
      id: blockId(),
      endpointId: endpoint,
      eventType: "PING",
      body: {},
      status: "pending",
      nextAttemptAt: NOW,
    });
    await db().delete(webhookEndpoints);
    expect(await db().select().from(webhookDeliveries)).toHaveLength(0);
  });
});
