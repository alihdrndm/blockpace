import {
  type CreateBlockRequest,
  compareDates,
  decodeCursor,
  evaluate,
  type IsoDate,
  newId,
  type PatchBlockRequest,
} from "@alihdrndm/blockpace-core";
import {
  type BlockNightRow,
  type BlockRow,
  blockNights,
  blocks,
  type Db,
  loadEvaluationInput,
  recordEvaluation,
  termsFromRow,
} from "@alihdrndm/blockpace-db";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lt, type SQL } from "drizzle-orm";
import { ClockService } from "../clock/clock.service.js";
import { toPage, toTimestamp } from "../common/http.js";
import { DB } from "../db/db.module.js";
import { notFound, validationFailed } from "../errors/problem.js";

/** The API shape of a block; the database keeps percentages as basis points. */
export function toBlockResponse(row: BlockRow, nights: BlockNightRow[]) {
  return {
    id: row.id,
    name: row.name,
    hotelName: row.hotelName,
    currency: row.currency,
    startDate: row.startDate,
    endDate: row.endDate,
    cutoffDate: row.cutoffDate,
    status: row.status,
    terms: termsFromRow(row),
    nights: [...nights]
      .sort((a, b) => a.night.localeCompare(b.night))
      .map((n) => ({
        date: n.night,
        contractedRooms: n.contractedRooms,
        rateMinor: n.rateMinor,
      })),
    createdAt: toTimestamp(row.createdAt),
    updatedAt: toTimestamp(row.updatedAt),
  };
}

@Injectable()
export class BlocksService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ClockService) private readonly clock: ClockService,
  ) {}

  async create(request: CreateBlockRequest) {
    const id = newId();
    const dates = request.nights.map((n) => n.date).sort(compareDates);
    const { terms } = request;

    // Block and nights are written together or not at all.
    await this.db.transaction(async (tx) => {
      await tx.insert(blocks).values({
        id,
        name: request.name,
        hotelName: request.hotelName,
        currency: request.currency,
        startDate: dates[0] ?? request.cutoffDate,
        endDate: dates[dates.length - 1] ?? request.cutoffDate,
        cutoffDate: request.cutoffDate,
        status: "active",
        basis: terms.basis,
        allowedAttritionBps: Math.round(terms.allowedAttritionPct * 100),
        damagesBps: Math.round(terms.damagesPct * 100),
        taxBps: Math.round(terms.taxPct * 100),
        resellCredit: terms.resellCredit,
        minimumRounding: terms.minimumRounding,
      });
      await tx.insert(blockNights).values(
        request.nights.map((n) => ({
          blockId: id,
          night: n.date,
          contractedRooms: n.contractedRooms,
          rateMinor: n.rateMinor,
        })),
      );
    });
    return this.get(id);
  }

  async get(id: string) {
    const [row] = await this.db.select().from(blocks).where(eq(blocks.id, id));
    if (row === undefined) throw notFound(`Block ${id}`);
    const nights = await this.db
      .select()
      .from(blockNights)
      .where(eq(blockNights.blockId, id))
      .orderBy(asc(blockNights.night));
    return toBlockResponse(row, nights);
  }

  async list(query: {
    limit: number;
    cursor?: string | undefined;
    status?: "active" | "closed" | undefined;
  }) {
    const conditions: SQL[] = [];
    if (query.status !== undefined)
      conditions.push(eq(blocks.status, query.status));
    // UUIDv7 ids sort by creation time, so "newest first" is "id descending".
    const after =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (after !== undefined) conditions.push(lt(blocks.id, after));

    const rows = await this.db
      .select()
      .from(blocks)
      .where(and(...conditions))
      .orderBy(desc(blocks.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);

    const nights =
      page.length === 0
        ? []
        : await this.db
            .select()
            .from(blockNights)
            .where(
              inArray(
                blockNights.blockId,
                page.map((r) => r.id),
              ),
            );
    const latest = new Map<
      string,
      Awaited<ReturnType<BlocksService["latestFor"]>>
    >();
    for (const row of page) latest.set(row.id, await this.latestFor(row.id));

    return toPage(rows, query.limit, (row) => {
      const { nights: _omitted, ...withoutNights } = toBlockResponse(
        row,
        nights.filter((n) => n.blockId === row.id),
      );
      const summary = latest.get(row.id);
      if (summary === undefined)
        throw new Error(`missing summary for ${row.id}`);
      return { ...withoutNights, latest: summary };
    });
  }

  /**
   * Changes name, hotel, cutoff, status or terms. Nights never change after creation.
   * When terms or the cutoff change, the block is re-evaluated in the same transaction,
   * so the stored evaluation and any alerts match the contract that was just saved.
   */
  async patch(id: string, patch: PatchBlockRequest) {
    await this.db.transaction(async (tx) => {
      // Row lock: two concurrent PATCHes on one block are applied one after the other.
      const [row] = await tx
        .select()
        .from(blocks)
        .where(eq(blocks.id, id))
        .for("update");
      if (row === undefined) throw notFound(`Block ${id}`);

      if (
        patch.cutoffDate !== undefined &&
        compareDates(patch.cutoffDate, row.startDate as IsoDate) > 0
      ) {
        throw validationFailed("1 field failed validation.", [
          {
            path: "cutoffDate",
            code: "custom",
            message: "cutoffDate must not be after the first night",
          },
        ]);
      }

      const { terms } = patch;
      await tx
        .update(blocks)
        .set({
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.hotelName === undefined
            ? {}
            : { hotelName: patch.hotelName }),
          ...(patch.cutoffDate === undefined
            ? {}
            : { cutoffDate: patch.cutoffDate }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(terms === undefined
            ? {}
            : {
                basis: terms.basis,
                allowedAttritionBps: Math.round(
                  terms.allowedAttritionPct * 100,
                ),
                damagesBps: Math.round(terms.damagesPct * 100),
                taxBps: Math.round(terms.taxPct * 100),
                resellCredit: terms.resellCredit,
                minimumRounding: terms.minimumRounding,
              }),
          updatedAt: this.clock.now(),
        })
        .where(eq(blocks.id, id));

      if (terms !== undefined || patch.cutoffDate !== undefined) {
        await recordEvaluation(tx, id, this.clock.today(), this.clock.now());
      }
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.db
      .delete(blocks)
      .where(eq(blocks.id, id))
      .returning({ id: blocks.id });
    if (deleted.length === 0) throw notFound(`Block ${id}`);
  }

  /** The list's `latest` summary: evaluated live for the clock's today. */
  private async latestFor(id: string) {
    const input = await loadEvaluationInput(this.db, id);
    const evaluation = evaluate({
      block: input.block,
      snapshots: input.snapshots,
      today: this.clock.today(),
    });
    return {
      riskLevel: evaluation.riskLevel,
      pickupPct: evaluation.pickupPct,
      shortfallRoomNights: evaluation.shortfallRoomNights,
      totalMinor: evaluation.totalMinor,
      ...(evaluation.forecast.status === "ok"
        ? { projectedTotalMinor: evaluation.forecast.projectedTotalMinor }
        : {}),
      ...(evaluation.snapshotAsOf === undefined
        ? {}
        : { snapshotAsOf: evaluation.snapshotAsOf }),
    };
  }
}
