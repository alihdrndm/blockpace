import {
  addDays,
  type Block,
  checkSnapshotAgainstBlock,
  compareDates,
  type Evaluation,
  type IsoDate,
  newId,
  type Snapshot,
  type SnapshotPutRequest,
} from "@alihdrndm/blockpace-core";
import {
  blockNights,
  blocks,
  type Db,
  type DbOrTx,
  recordEvaluation,
  type SnapshotNightRow,
  type SnapshotRow,
  snapshotNights,
  snapshots,
} from "@alihdrndm/blockpace-db";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { ClockService } from "../clock/clock.service.js";
import { toTimestamp } from "../common/http.js";
import { DB } from "../db/db.module.js";
import { notFound, ProblemException } from "../errors/problem.js";
import { parseSnapshotCsv } from "./snapshot-csv.js";

export const MAX_SNAPSHOTS_PER_BLOCK = 400;

type Source = "manual" | "csv" | "api";

export function toSnapshotResponse(
  row: SnapshotRow,
  nights: SnapshotNightRow[],
) {
  return {
    id: row.id,
    blockId: row.blockId,
    asOfDate: row.asOfDate,
    source: row.source as Source,
    ...(row.note === null ? {} : { note: row.note }),
    nights: nights
      .filter((n) => n.snapshotId === row.id)
      .sort((a, b) => a.night.localeCompare(b.night))
      .map((n) => ({
        date: n.night,
        pickedUpRooms: n.pickedUpRooms,
        resoldRooms: n.resoldRooms,
      })),
    createdAt: toTimestamp(row.createdAt),
  };
}

const tooManySnapshots = () =>
  new ProblemException(
    409,
    "SNAPSHOT_LIMIT",
    "Too many snapshots",
    `A block can hold at most ${MAX_SNAPSHOTS_PER_BLOCK} snapshots. Replace or delete an existing one.`,
  );

@Injectable()
export class SnapshotsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ClockService) private readonly clock: ClockService,
  ) {}

  /**
   * Creates or replaces the snapshot for one as-of date. The snapshot, the re-evaluation and any
   * alerts it raises are one transaction: either all of it is saved or none of it.
   */
  async put(
    blockId: string,
    asOfDate: IsoDate,
    request: SnapshotPutRequest,
  ): Promise<{
    snapshot: ReturnType<typeof toSnapshotResponse>;
    evaluation: Evaluation;
  }> {
    const today = this.clock.today();

    return this.db.transaction(async (tx) => {
      // The block is checked first, so an unknown block is 404 whatever the date says.
      const block = await this.lockBlock(tx, blockId);
      if (compareDates(asOfDate, addDays(today, 1)) > 0) {
        throw new ProblemException(
          422,
          "SNAPSHOT_IN_FUTURE",
          "Snapshot date is in the future",
          `asOfDate ${asOfDate} is later than ${addDays(today, 1)} (today + 1 day).`,
        );
      }
      const snapshot: Snapshot = { asOfDate, nights: request.nights };

      const mismatch = checkSnapshotAgainstBlock(block, snapshot);
      if (mismatch.missing.length > 0 || mismatch.extra.length > 0) {
        throw new ProblemException(
          422,
          "SNAPSHOT_NIGHTS_MISMATCH",
          "Snapshot nights do not match the block",
          `Missing nights: ${mismatch.missing.join(", ") || "none"}. Extra nights: ${mismatch.extra.join(", ") || "none"}.`,
        );
      }
      if (mismatch.resoldExceeds.length > 0) {
        throw new ProblemException(
          422,
          "RESOLD_EXCEEDS_CONTRACTED",
          "Resold rooms exceed contracted rooms",
          `Resold rooms are more than contracted rooms on ${mismatch.resoldExceeds.join(", ")}.`,
        );
      }

      const id = await this.writeSnapshot(
        tx,
        blockId,
        snapshot,
        "api",
        request.note,
      );
      const { evaluation } = await recordEvaluation(
        tx,
        blockId,
        today,
        this.clock.now(),
      );
      const [row] = await tx
        .select()
        .from(snapshots)
        .where(eq(snapshots.id, id));
      if (row === undefined)
        throw new Error(`snapshot ${id} vanished inside its own transaction`);
      const nights = await tx
        .select()
        .from(snapshotNights)
        .where(eq(snapshotNights.snapshotId, id));
      return { snapshot: toSnapshotResponse(row, nights), evaluation };
    });
  }

  /** All snapshots of a block with their nights, oldest first. */
  async list(blockId: string) {
    const [block] = await this.db
      .select({ id: blocks.id })
      .from(blocks)
      .where(eq(blocks.id, blockId));
    if (block === undefined) throw notFound(`Block ${blockId}`);
    const rows = await this.db
      .select()
      .from(snapshots)
      .where(eq(snapshots.blockId, blockId))
      .orderBy(asc(snapshots.asOfDate));
    const nights =
      rows.length === 0
        ? []
        : await this.db
            .select()
            .from(snapshotNights)
            .where(
              inArray(
                snapshotNights.snapshotId,
                rows.map((r) => r.id),
              ),
            );
    return rows.map((row) => toSnapshotResponse(row, nights));
  }

  async remove(blockId: string, asOfDate: IsoDate): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockBlock(tx, blockId);
      const deleted = await tx
        .delete(snapshots)
        .where(
          and(eq(snapshots.blockId, blockId), eq(snapshots.asOfDate, asOfDate)),
        )
        .returning({ id: snapshots.id });
      if (deleted.length === 0)
        throw notFound(`Snapshot ${asOfDate} of block ${blockId}`);
      await recordEvaluation(tx, blockId, this.clock.today(), this.clock.now());
    });
  }

  /**
   * Imports a CSV of many snapshots. All-or-nothing: any bad row rejects the whole file and
   * nothing is saved. The block is re-evaluated once, after every snapshot is written.
   */
  async importCsv(
    blockId: string,
    file: Buffer | undefined,
  ): Promise<{ snapshots: number }> {
    const today = this.clock.today();
    return this.db.transaction(async (tx) => {
      const block = await this.lockBlock(tx, blockId);
      const parsed = parseSnapshotCsv(file, block, addDays(today, 1));

      const existing = await tx
        .select({ asOfDate: snapshots.asOfDate })
        .from(snapshots)
        .where(eq(snapshots.blockId, blockId));
      const existingDates = new Set(existing.map((s) => s.asOfDate));
      const added = parsed.filter((s) => !existingDates.has(s.asOfDate)).length;
      if (existing.length + added > MAX_SNAPSHOTS_PER_BLOCK)
        throw tooManySnapshots();

      for (const snapshot of parsed) {
        await this.writeSnapshot(tx, blockId, snapshot, "csv", undefined);
      }
      await recordEvaluation(tx, blockId, today, this.clock.now());
      return { snapshots: parsed.length };
    });
  }

  /**
   * Locks the block row for the rest of the transaction (so two writers cannot both pass the
   * 400-snapshot check) and returns its nights in the shape the core checks expect.
   */
  private async lockBlock(
    tx: DbOrTx,
    blockId: string,
  ): Promise<Pick<Block, "nights">> {
    const [row] = await tx
      .select({ id: blocks.id })
      .from(blocks)
      .where(eq(blocks.id, blockId))
      .for("update");
    if (row === undefined) throw notFound(`Block ${blockId}`);
    const nights = await tx
      .select()
      .from(blockNights)
      .where(eq(blockNights.blockId, blockId));
    return {
      nights: nights.map((n) => ({
        date: n.night as IsoDate,
        contractedRooms: n.contractedRooms,
        rateMinor: n.rateMinor,
      })),
    };
  }

  /** Inserts a new snapshot or replaces the nights of the existing one for that date (same id). */
  private async writeSnapshot(
    tx: DbOrTx,
    blockId: string,
    snapshot: Snapshot,
    source: Source,
    note: string | undefined,
  ): Promise<string> {
    const [current] = await tx
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.blockId, blockId),
          eq(snapshots.asOfDate, snapshot.asOfDate),
        ),
      );

    let id: string;
    if (current === undefined) {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(snapshots)
        .where(eq(snapshots.blockId, blockId));
      if (total >= MAX_SNAPSHOTS_PER_BLOCK) throw tooManySnapshots();
      id = newId();
      await tx.insert(snapshots).values({
        id,
        blockId,
        asOfDate: snapshot.asOfDate,
        source,
        note: note ?? null,
      });
    } else {
      id = current.id;
      await tx
        .update(snapshots)
        .set({ source, note: note ?? null })
        .where(eq(snapshots.id, id));
      await tx.delete(snapshotNights).where(eq(snapshotNights.snapshotId, id));
    }

    await tx.insert(snapshotNights).values(
      snapshot.nights.map((n) => ({
        snapshotId: id,
        night: n.date,
        pickedUpRooms: n.pickedUpRooms,
        resoldRooms: n.resoldRooms,
      })),
    );
    return id;
  }
}
