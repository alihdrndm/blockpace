import type { IsoDate } from "@alihdrndm/blockpace-core";
import { addDays } from "@alihdrndm/blockpace-core";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import { createDb, createPool, type Db } from "../client.js";
import { migrate } from "../migrate.js";
import {
  blockNights,
  blocks,
  snapshotNights,
  snapshots,
  webhookEndpoints,
} from "../schema.js";

export const TODAY = "2026-10-06" as IsoDate;
export const NOW = new Date("2026-10-06T08:00:00Z");

/** Opens a pool on the shared test database, migrates it, and empties all tables before each test. */
export function useTestDb(): { db: () => Db } {
  const pool = createPool(inject("dbUrl"));
  const db = createDb(pool);

  beforeAll(async () => {
    await migrate(db);
  });
  beforeEach(async () => {
    // Truncating the two roots cascades to every child table through the foreign keys.
    await db.execute(sql`truncate table blocks, webhook_endpoints cascade`);
  });
  afterAll(async () => {
    await pool.end();
  });
  return { db: () => db };
}

export interface BlockOptions {
  id: string;
  status?: "active" | "closed";
  basis?: "cumulative" | "per_night";
  /** Days from TODAY to the cutoff date. */
  cutoffOffset: number;
  /** One night of 100 rooms at 100.00; attrition 20% so the minimum is 80. */
  attritionPct?: number;
}

let nextBlock = 1;
export const blockId = () =>
  `01900000-0000-7000-8000-${String(nextBlock++).padStart(12, "0")}`;

/** A one-night block, far enough out (TODAY + 90) that any cutoff offset up to 60 is valid. */
export async function insertBlock(
  db: Db,
  options: BlockOptions,
): Promise<string> {
  const night = addDays(TODAY, 90);
  await db.insert(blocks).values({
    id: options.id,
    name: "Test block",
    hotelName: "Test hotel",
    currency: "USD",
    startDate: night,
    endDate: night,
    cutoffDate: addDays(TODAY, options.cutoffOffset),
    status: options.status ?? "active",
    basis: options.basis ?? "cumulative",
    allowedAttritionBps: Math.round((options.attritionPct ?? 20) * 100),
    damagesBps: 10000,
    taxBps: 0,
    resellCredit: false,
    minimumRounding: "ceil",
  });
  await db.insert(blockNights).values({
    blockId: options.id,
    night,
    contractedRooms: 100,
    rateMinor: 10000,
  });
  return options.id;
}

let nextSnapshot = 1;

/** Records pickup for the block's single night as reported `daysAgo` days before TODAY. */
export async function insertSnapshot(
  db: Db,
  blockIdValue: string,
  daysAgo: number,
  pickedUpRooms: number,
): Promise<void> {
  const id = `01900000-0000-7000-9000-${String(nextSnapshot++).padStart(12, "0")}`;
  await db.insert(snapshots).values({
    id,
    blockId: blockIdValue,
    asOfDate: addDays(TODAY, -daysAgo),
    source: "api",
  });
  await db.insert(snapshotNights).values({
    snapshotId: id,
    night: addDays(TODAY, 90),
    pickedUpRooms,
  });
}

let nextEndpoint = 1;

export async function insertEndpoint(db: Db, active = true): Promise<string> {
  const id = `01900000-0000-7000-a000-${String(nextEndpoint++).padStart(12, "0")}`;
  await db.insert(webhookEndpoints).values({
    id,
    url: "http://localhost:4999/",
    secret: "test-secret",
    active,
  });
  return id;
}
