import { addDays, type IsoDate } from "@alihdrndm/blockpace-core";
import { inArray } from "drizzle-orm";
import type { Db } from "./client.js";
import { recordEvaluation } from "./record-evaluation.js";
import {
  blockNights,
  blocks,
  snapshotNights,
  snapshots,
  webhookEndpoints,
} from "./schema.js";

// Synthetic demo data (HANDOFF.md "Seed data"). All names are invented; no real people or hotels.
// The ids are fixed so a rerun can find and replace exactly these rows and nothing else.

export const SEED_ENDPOINT_ID = "01900000-0000-7000-8000-0000000000e1";
export const SEED_ENDPOINT_SECRET = "dev-secret-do-not-use";

interface SeedBlock {
  id: string;
  name: string;
  hotelName: string;
  firstNightOffset: number;
  nights: { rooms: number; rateMinor: number }[];
  cutoffOffset: number;
  basis: "cumulative" | "per_night";
  allowedAttritionPct: number;
  damagesPct: number;
  /** Pickup per night at today + offset. */
  snapshots: { offset: number; pickup: number[] }[];
}

const TECHCONF_NIGHTS = [
  { rooms: 45, rateMinor: 18900 },
  { rooms: 60, rateMinor: 18900 },
  { rooms: 60, rateMinor: 21900 },
  { rooms: 35, rateMinor: 21900 },
];
const TECHCONF_SNAPSHOTS = [
  { offset: -14, pickup: [20, 28, 25, 15] },
  { offset: -7, pickup: [26, 34, 30, 19] },
  { offset: 0, pickup: [31, 40, 35, 23] },
];

export const SEED_BLOCKS: SeedBlock[] = [
  {
    id: "01900000-0000-7000-8000-0000000000b1",
    name: "TechConf",
    hotelName: "Harborview Hotel",
    firstNightOffset: 35,
    nights: TECHCONF_NIGHTS,
    cutoffOffset: 14,
    basis: "cumulative",
    allowedAttritionPct: 15,
    damagesPct: 80,
    snapshots: TECHCONF_SNAPSHOTS,
  },
  {
    id: "01900000-0000-7000-8000-0000000000b2",
    name: "TechConf",
    hotelName: "Courtyard Annex",
    firstNightOffset: 35,
    nights: TECHCONF_NIGHTS,
    cutoffOffset: 14,
    basis: "per_night",
    allowedAttritionPct: 15,
    damagesPct: 80,
    snapshots: TECHCONF_SNAPSHOTS,
  },
  {
    id: "01900000-0000-7000-8000-0000000000b3",
    name: "Sales Kickoff",
    hotelName: "Lakeside Resort",
    firstNightOffset: 50,
    nights: [
      { rooms: 80, rateMinor: 15900 },
      { rooms: 80, rateMinor: 15900 },
      { rooms: 60, rateMinor: 15900 },
    ],
    cutoffOffset: 21,
    basis: "cumulative",
    allowedAttritionPct: 20,
    damagesPct: 100,
    snapshots: [
      { offset: -14, pickup: [50, 52, 40] },
      { offset: -7, pickup: [60, 61, 45] },
      { offset: 0, pickup: [68, 70, 52] },
    ],
  },
];

export interface SeedOptions {
  today: IsoDate;
  webhookUrl: string;
  now?: Date;
}

/**
 * Replaces the demo data. Idempotent: it deletes the three seed blocks (children cascade) and
 * recreates them relative to `today`, so running it twice leaves the same data. Blocks you
 * created yourself and deliveries queued for the seed endpoint are left alone.
 */
export async function seed(db: Db, options: SeedOptions): Promise<void> {
  const { today, webhookUrl, now = new Date() } = options;

  await db.transaction(async (tx) => {
    await tx.delete(blocks).where(
      inArray(
        blocks.id,
        SEED_BLOCKS.map((b) => b.id),
      ),
    );
    // The endpoint exists before the evaluations so the alerts they raise get a delivery row.
    // Upserted, not deleted: deleting it would cascade to every delivery queued for this endpoint.
    await tx
      .insert(webhookEndpoints)
      .values({
        id: SEED_ENDPOINT_ID,
        url: webhookUrl,
        secret: SEED_ENDPOINT_SECRET,
      })
      .onConflictDoUpdate({
        target: webhookEndpoints.id,
        set: {
          url: webhookUrl,
          secret: SEED_ENDPOINT_SECRET,
          active: true,
          updatedAt: now,
        },
      });

    for (const [blockIndex, block] of SEED_BLOCKS.entries()) {
      const firstNight = addDays(today, block.firstNightOffset);
      const nightDates = block.nights.map((_, i) => addDays(firstNight, i));

      await tx.insert(blocks).values({
        id: block.id,
        name: block.name,
        hotelName: block.hotelName,
        currency: "USD",
        startDate: firstNight,
        endDate: nightDates[nightDates.length - 1] ?? firstNight,
        cutoffDate: addDays(today, block.cutoffOffset),
        status: "active",
        basis: block.basis,
        allowedAttritionBps: Math.round(block.allowedAttritionPct * 100),
        damagesBps: Math.round(block.damagesPct * 100),
        taxBps: 0,
        resellCredit: false,
        minimumRounding: "ceil",
      });
      await tx.insert(blockNights).values(
        block.nights.map((night, i) => ({
          blockId: block.id,
          night: nightDates[i] ?? firstNight,
          contractedRooms: night.rooms,
          rateMinor: night.rateMinor,
        })),
      );

      for (const [snapshotIndex, snap] of block.snapshots.entries()) {
        // Deterministic ids derived from the block and snapshot position keep reruns identical.
        const snapshotId = `01900000-0000-7000-8000-${blockIndex}${snapshotIndex}0000000000`;
        await tx.insert(snapshots).values({
          id: snapshotId,
          blockId: block.id,
          asOfDate: addDays(today, snap.offset),
          source: "api",
        });
        await tx.insert(snapshotNights).values(
          snap.pickup.map((pickedUpRooms, i) => ({
            snapshotId,
            night: nightDates[i] ?? firstNight,
            pickedUpRooms,
          })),
        );
      }

      await recordEvaluation(tx, block.id, today, now);
    }
  });
}
