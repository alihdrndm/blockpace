import {
  type Block,
  BlockSchema,
  diffDays,
  type Evaluation,
  evaluate,
  type IsoDate,
  newId,
  type RiskLevel,
  type Snapshot,
  SnapshotSchema,
} from "@alihdrndm/blockpace-core";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "./client.js";
import {
  type AlertEventRow,
  alertEvents,
  blockNights,
  blocks,
  evaluations,
  snapshotNights,
  snapshots,
  webhookDeliveries,
  webhookEndpoints,
} from "./schema.js";

export type AlertType =
  | "RISK_LEVEL_CHANGED"
  | "CUTOFF_APPROACHING"
  | "SNAPSHOT_STALE";

export interface RecordedEvaluation {
  evaluation: Evaluation;
  /** Only alerts inserted by this call; ones that already existed are not listed. */
  alerts: AlertEventRow[];
}

export class BlockNotFoundError extends Error {
  constructor(readonly blockId: string) {
    super(`Block ${blockId} not found`);
  }
}

const CUTOFF_REMINDER_DAYS = [30, 14, 7, 3, 1];
const STALE_AGE_DAYS = [7, 14, 21];
const STALE_MAX_DAYS_TO_CUTOFF = 60;

interface AlertCandidate {
  type: AlertType;
  dedupeKey: string;
}

/** RFC 3339 in UTC without fractional seconds, e.g. 2026-10-05T13:02:11Z. */
const toTimestamp = (date: Date): string =>
  date.toISOString().replace(/\.\d{3}Z$/, "Z");

async function loadSnapshots(tx: DbOrTx, blockId: string): Promise<Snapshot[]> {
  const snapshotRows = await tx
    .select()
    .from(snapshots)
    .where(eq(snapshots.blockId, blockId))
    .orderBy(asc(snapshots.asOfDate));
  if (snapshotRows.length === 0) return [];

  const nightRows = await tx
    .select()
    .from(snapshotNights)
    .where(
      inArray(
        snapshotNights.snapshotId,
        snapshotRows.map((row) => row.id),
      ),
    )
    .orderBy(asc(snapshotNights.night));

  return snapshotRows.map((row) =>
    SnapshotSchema.parse({
      asOfDate: row.asOfDate,
      nights: nightRows
        .filter((night) => night.snapshotId === row.id)
        .map((night) => ({
          date: night.night,
          pickedUpRooms: night.pickedUpRooms,
          resoldRooms: night.resoldRooms,
        })),
    }),
  );
}

/** Decides which alerts the evaluation calls for; the database decides which are actually new. */
function alertCandidates(
  evaluation: Evaluation,
  previousLevel: RiskLevel | undefined,
  today: IsoDate,
): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  const level = evaluation.riskLevel;

  const changed =
    previousLevel === undefined
      ? level === "at_risk" || level === "liable"
      : previousLevel !== level;
  if (changed) {
    candidates.push({
      type: "RISK_LEVEL_CHANGED",
      dedupeKey: `${today}:${previousLevel ?? "none"}>${level}`,
    });
  }

  if (
    evaluation.shortfallRoomNights > 0 &&
    CUTOFF_REMINDER_DAYS.includes(evaluation.daysToCutoff)
  ) {
    candidates.push({
      type: "CUTOFF_APPROACHING",
      dedupeKey: `${evaluation.daysToCutoff}`,
    });
  }

  if (
    evaluation.snapshotAsOf !== undefined &&
    evaluation.daysToCutoff >= 1 &&
    evaluation.daysToCutoff <= STALE_MAX_DAYS_TO_CUTOFF
  ) {
    const age = diffDays(today, evaluation.snapshotAsOf);
    if (STALE_AGE_DAYS.includes(age)) {
      candidates.push({
        type: "SNAPSHOT_STALE",
        dedupeKey: `${evaluation.snapshotAsOf}:${age}`,
      });
    }
  }
  return candidates;
}

/**
 * Evaluates one block, stores the result and raises alerts. This is the only routine that
 * creates alerts and webhook deliveries.
 *
 * It runs inside the caller's transaction (pass the `tx` from `db.transaction`), so the
 * evaluation, the alerts and their deliveries commit or roll back together.
 * `now` is a parameter so tests control timestamps; production callers leave it out.
 */
export async function recordEvaluation(
  tx: DbOrTx,
  blockId: string,
  today: IsoDate,
  now: Date = new Date(),
): Promise<RecordedEvaluation> {
  // 1. Load everything and evaluate.
  const [blockRow] = await tx
    .select()
    .from(blocks)
    .where(eq(blocks.id, blockId));
  if (blockRow === undefined) throw new BlockNotFoundError(blockId);

  const nightRows = await tx
    .select()
    .from(blockNights)
    .where(eq(blockNights.blockId, blockId))
    .orderBy(asc(blockNights.night));

  const block: Block = BlockSchema.parse({
    currency: blockRow.currency,
    cutoffDate: blockRow.cutoffDate,
    terms: {
      basis: blockRow.basis,
      allowedAttritionPct: blockRow.allowedAttritionBps / 100,
      damagesPct: blockRow.damagesBps / 100,
      taxPct: blockRow.taxBps / 100,
      resellCredit: blockRow.resellCredit,
      minimumRounding: blockRow.minimumRounding,
    },
    nights: nightRows.map((night) => ({
      date: night.night,
      contractedRooms: night.contractedRooms,
      rateMinor: night.rateMinor,
    })),
  });
  const evaluation = evaluate({
    block,
    snapshots: await loadSnapshots(tx, blockId),
    today,
  });

  // 2. The previous level must be read before this call writes anything: it is the
  // comparison point for RISK_LEVEL_CHANGED. It may be today's own row on a re-run.
  const [previous] = await tx
    .select({ riskLevel: evaluations.riskLevel })
    .from(evaluations)
    .where(eq(evaluations.blockId, blockId))
    .orderBy(desc(evaluations.evaluatedFor))
    .limit(1);
  const previousLevel = previous?.riskLevel as RiskLevel | undefined;

  // 3. One evaluation row per block per day; later runs the same day overwrite it.
  await tx
    .insert(evaluations)
    .values({
      id: newId(),
      blockId,
      evaluatedFor: today,
      riskLevel: evaluation.riskLevel,
      result: evaluation,
    })
    .onConflictDoUpdate({
      target: [evaluations.blockId, evaluations.evaluatedFor],
      set: {
        riskLevel: evaluation.riskLevel,
        result: evaluation,
        updatedAt: now,
      },
    });

  // Whole seconds only, so the alert row and the RFC 3339 timestamp in its payload agree exactly.
  const stamp = new Date(Math.floor(now.getTime() / 1000) * 1000);

  // Closed blocks are evaluated and stored but never raise alerts.
  if (blockRow.status !== "active") return { evaluation, alerts: [] };

  // 4. The unique (block, type, dedupe_key) constraint is what makes each alert fire once:
  // a repeat insert is silently skipped, and only rows really inserted count as new.
  const created: AlertEventRow[] = [];
  for (const candidate of alertCandidates(evaluation, previousLevel, today)) {
    const id = newId();
    const payload = {
      id,
      type: candidate.type,
      createdAt: toTimestamp(now),
      block: {
        id: blockRow.id,
        name: blockRow.name,
        hotelName: blockRow.hotelName,
        currency: blockRow.currency,
        cutoffDate: blockRow.cutoffDate,
      },
      evaluation,
      ...(previousLevel === undefined
        ? {}
        : { previousRiskLevel: previousLevel }),
    };
    const inserted = await tx
      .insert(alertEvents)
      .values({
        id,
        blockId,
        type: candidate.type,
        dedupeKey: candidate.dedupeKey,
        payload,
        createdAt: stamp,
      })
      .onConflictDoNothing()
      .returning();
    created.push(...inserted);
  }

  // 5. Every new alert is queued once per active webhook endpoint; the worker delivers them.
  if (created.length > 0) {
    const endpoints = await tx
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.active, true));
    const deliveries = created.flatMap((alert) =>
      endpoints.map((endpoint) => ({
        id: newId(),
        endpointId: endpoint.id,
        alertEventId: alert.id,
        eventType: alert.type,
        body: alert.payload,
        status: "pending" as const,
        nextAttemptAt: stamp,
      })),
    );
    if (deliveries.length > 0)
      await tx.insert(webhookDeliveries).values(deliveries);
  }

  return { evaluation, alerts: created };
}
