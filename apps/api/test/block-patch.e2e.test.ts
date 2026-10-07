import type { IsoDate } from "@alihdrndm/blockpace-core";
import {
  alertEvents,
  blocks,
  evaluations,
  SEED_BLOCKS,
  seed,
  webhookDeliveries,
} from "@alihdrndm/blockpace-db";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { API_KEY, TODAY, useTestApp } from "./support/app.js";

const { http, db } = useTestApp();

const patch = (id: string, body: object) =>
  http().patch(`/v1/blocks/${id}`).set("x-api-key", API_KEY).send(body);

// Harborview (cumulative basis, on_track) and Lakeside (met), from the seed data.
const HARBORVIEW = SEED_BLOCKS[0]?.id ?? "";
const LAKESIDE = SEED_BLOCKS[2]?.id ?? "";

beforeAll(async () => {
  await seed(db(), {
    today: TODAY as IsoDate,
    webhookUrl: "http://localhost:4999/",
  });
});

const levelOf = async (id: string) => {
  const [row] = await db()
    .select()
    .from(evaluations)
    .where(
      and(eq(evaluations.blockId, id), eq(evaluations.evaluatedFor, TODAY)),
    );
  return row?.riskLevel;
};

describe("PATCH /v1/blocks/:id", () => {
  it("changes the name and hotel without re-evaluating", async () => {
    const before = await db().select().from(alertEvents);
    const res = await patch(LAKESIDE, {
      name: "Sales Kickoff 2027",
      hotelName: "Lakeside",
    }).expect(200);
    expect(res.body).toMatchObject({
      name: "Sales Kickoff 2027",
      hotelName: "Lakeside",
    });
    expect(res.body.nights).toHaveLength(3);
    expect(await db().select().from(alertEvents)).toHaveLength(before.length);
  });

  it("new terms re-evaluate in the same transaction and raise one RISK_LEVEL_CHANGED alert", async () => {
    expect(await levelOf(HARBORVIEW)).toBe("on_track");
    const terms = {
      basis: "per_night",
      allowedAttritionPct: 15,
      damagesPct: 80,
    };

    const res = await patch(HARBORVIEW, { terms }).expect(200);
    expect(res.body.terms).toMatchObject({
      basis: "per_night",
      allowedAttritionPct: 15,
    });
    // Per-night basis turns WE3 from on_track into at_risk (projected shortfall 6 room nights).
    expect(await levelOf(HARBORVIEW)).toBe("at_risk");

    const changed = await db()
      .select()
      .from(alertEvents)
      .where(
        and(
          eq(alertEvents.blockId, HARBORVIEW),
          eq(alertEvents.type, "RISK_LEVEL_CHANGED"),
        ),
      );
    expect(changed.map((a) => a.dedupeKey)).toEqual([
      `${TODAY}:on_track>at_risk`,
    ]);
    const deliveries = await db()
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.alertEventId, changed[0]?.id ?? ""));
    expect(deliveries).toHaveLength(1);

    // The same terms again: re-evaluated, but nothing new to alert about.
    await patch(HARBORVIEW, { terms }).expect(200);
    const again = await db()
      .select()
      .from(alertEvents)
      .where(
        and(
          eq(alertEvents.blockId, HARBORVIEW),
          eq(alertEvents.type, "RISK_LEVEL_CHANGED"),
        ),
      );
    expect(again).toHaveLength(1);
  });

  it("a cutoff change re-evaluates, and the cutoff may not move past the first night", async () => {
    const { body } = await http()
      .get(`/v1/blocks/${LAKESIDE}`)
      .set("x-api-key", API_KEY)
      .expect(200);
    const res = await patch(LAKESIDE, { cutoffDate: body.startDate }).expect(
      200,
    );
    expect(res.body.cutoffDate).toBe(body.startDate);

    const late = await patch(LAKESIDE, { cutoffDate: body.endDate }).expect(
      422,
    );
    expect(late.body.code).toBe("VALIDATION_FAILED");
    expect(late.body.errors[0].path).toBe("cutoffDate");
  });

  it("closing a block is allowed and moves updated_at forward", async () => {
    const updatedAt = async () => {
      const [row] = await db()
        .select()
        .from(blocks)
        .where(eq(blocks.id, LAKESIDE));
      return row?.updatedAt.getTime() ?? 0;
    };
    const before = await updatedAt();
    const res = await patch(LAKESIDE, { status: "closed" }).expect(200);
    expect(res.body.status).toBe("closed");
    // Compared in the database (milliseconds); the API rounds timestamps to whole seconds.
    expect(await updatedAt()).toBeGreaterThan(before);
  });

  it("VALIDATION_FAILED for an empty body, nights, or partial terms; NOT_FOUND for an unknown id", async () => {
    for (const body of [
      {},
      { nights: [] },
      { terms: { basis: "cumulative" } },
      { status: "open" },
    ]) {
      expect((await patch(LAKESIDE, body).expect(422)).body.code).toBe(
        "VALIDATION_FAILED",
      );
    }
    const missing = await patch("01900000-0000-7000-8000-ffffffffffff", {
      name: "x",
    }).expect(404);
    expect(missing.body.code).toBe("NOT_FOUND");
  });
});
