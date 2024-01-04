import { addDays } from "@alihdrndm/blockpace-core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { BlockNotFoundError, recordEvaluation } from "./record-evaluation.js";
import { alertEvents, evaluations, webhookDeliveries } from "./schema.js";
import {
  blockId,
  insertBlock,
  insertEndpoint,
  insertSnapshot,
  NOW,
  TODAY,
  useTestDb,
} from "./testing/db.js";

// Every block here has 1 night of 100 rooms and a 20% allowance, so the minimum is 80 rooms.
const { db } = useTestDb();

const alertsOf = async (id: string, type?: string) => {
  const rows = await db()
    .select()
    .from(alertEvents)
    .where(eq(alertEvents.blockId, id));
  return type === undefined ? rows : rows.filter((row) => row.type === type);
};

const run = (id: string, today = TODAY, now = NOW) =>
  db().transaction((tx) => recordEvaluation(tx, id, today, now));

describe("recordEvaluation: evaluation row", () => {
  it("stores the evaluation and overwrites it on a same-day re-run", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 20 });
    await insertSnapshot(db(), id, 0, 50);
    await run(id);
    await insertSnapshot(db(), id, 1, 40);
    await run(id);
    const rows = await db()
      .select()
      .from(evaluations)
      .where(eq(evaluations.blockId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.evaluatedFor).toBe(TODAY);
    expect(rows[0]?.updatedAt.getTime()).toBe(NOW.getTime());
    // The second run saw a 10-room gain overnight, so the stored level moved from at_risk to on_track.
    expect(rows[0]?.riskLevel).toBe("on_track");
    const stored = rows[0]?.result as
      | { shortfallRoomNights: number }
      | undefined;
    expect(stored?.shortfallRoomNights).toBe(30);
  });

  it("throws BlockNotFoundError for an unknown block", async () => {
    await expect(
      run("01900000-0000-7000-8000-ffffffffffff"),
    ).rejects.toBeInstanceOf(BlockNotFoundError);
  });

  it("closed blocks are evaluated and stored but never raise alerts", async () => {
    const id = await insertBlock(db(), {
      id: blockId(),
      cutoffOffset: 14,
      status: "closed",
    });
    await insertEndpoint(db());
    const { evaluation, alerts } = await run(id);
    expect(evaluation.riskLevel).toBe("at_risk");
    expect(alerts).toEqual([]);
    const stored = await db()
      .select()
      .from(evaluations)
      .where(eq(evaluations.blockId, id));
    expect(stored).toHaveLength(1);
    expect(await alertsOf(id)).toHaveLength(0);
    expect(await db().select().from(webhookDeliveries)).toHaveLength(0);
  });
});

describe("recordEvaluation: RISK_LEVEL_CHANGED", () => {
  it("is raised when the first evaluation is at_risk, once, and not on a repeat call", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 20 });
    const first = await run(id);
    expect(first.alerts.map((a) => [a.type, a.dedupeKey])).toEqual([
      ["RISK_LEVEL_CHANGED", `${TODAY}:none>at_risk`],
    ]);
    // No previousRiskLevel when there was no earlier evaluation.
    expect("previousRiskLevel" in (first.alerts[0]?.payload ?? {})).toBe(false);

    const repeat = await run(id);
    expect(repeat.alerts).toEqual([]);
    expect(await alertsOf(id, "RISK_LEVEL_CHANGED")).toHaveLength(1);
  });

  it("is not raised when the first evaluation is met or on_track", async () => {
    const met = await insertBlock(db(), { id: blockId(), cutoffOffset: 20 });
    await insertSnapshot(db(), met, 0, 90);
    expect((await run(met)).evaluation.riskLevel).toBe("met");
    expect(await alertsOf(met)).toHaveLength(0);

    const onTrack = await insertBlock(db(), {
      id: blockId(),
      cutoffOffset: 20,
    });
    await insertSnapshot(db(), onTrack, 7, 50);
    await insertSnapshot(db(), onTrack, 0, 60);
    // Gain 10 in 7 days, 20 days left: 60 + floor(10 * 20 / 7) = 88, above the minimum of 80.
    expect((await run(onTrack)).evaluation.riskLevel).toBe("on_track");
    expect(await alertsOf(onTrack, "RISK_LEVEL_CHANGED")).toHaveLength(0);
  });

  it("is raised once when the level changes, carrying previousRiskLevel", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 20 });
    await insertSnapshot(db(), id, 0, 90);
    await run(id);

    // Tomorrow a lower pickup report arrives: met becomes at_risk.
    const tomorrow = addDays(TODAY, 1);
    await insertSnapshot(db(), id, -1, 50);
    const changed = await run(id, tomorrow);
    expect(changed.alerts.map((a) => [a.type, a.dedupeKey])).toEqual([
      ["RISK_LEVEL_CHANGED", `${tomorrow}:met>at_risk`],
    ]);
    const payload = changed.alerts[0]?.payload as {
      previousRiskLevel?: string;
    };
    expect(payload.previousRiskLevel).toBe("met");
    expect((await run(id, tomorrow)).alerts).toEqual([]);
  });

  it("raises a same-day level change once, keyed by that day", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 20 });
    await insertSnapshot(db(), id, 0, 50);
    await run(id);
    // A new report dated yesterday adds a 10-room gain, so the same day moves at_risk to on_track.
    await insertSnapshot(db(), id, 1, 40);
    const changed = await run(id);
    expect(changed.alerts.map((a) => a.dedupeKey)).toEqual([
      `${TODAY}:at_risk>on_track`,
    ]);
    expect((await run(id)).alerts).toEqual([]);
  });

  it("raises liable once the cutoff has passed with a shortfall", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 20 });
    await insertSnapshot(db(), id, 7, 50);
    await insertSnapshot(db(), id, 0, 60);
    await run(id);
    const afterCutoff = addDays(TODAY, 21);
    const result = await run(id, afterCutoff);
    expect(result.evaluation.riskLevel).toBe("liable");
    expect(result.alerts.map((a) => a.dedupeKey)).toContain(
      `${afterCutoff}:on_track>liable`,
    );
  });
});

describe("recordEvaluation: CUTOFF_APPROACHING", () => {
  for (const days of [30, 14, 7, 3, 1]) {
    it(`is raised once at ${days} days to cutoff with a shortfall`, async () => {
      const id = await insertBlock(db(), { id: blockId(), cutoffOffset: days });
      const first = await run(id);
      const reminders = first.alerts.filter(
        (a) => a.type === "CUTOFF_APPROACHING",
      );
      expect(reminders.map((a) => a.dedupeKey)).toEqual([`${days}`]);
      expect((await run(id)).alerts).toEqual([]);
      expect(await alertsOf(id, "CUTOFF_APPROACHING")).toHaveLength(1);
    });
  }

  it("is not raised on other days, or when there is no shortfall", async () => {
    const off = await insertBlock(db(), { id: blockId(), cutoffOffset: 29 });
    await run(off);
    expect(await alertsOf(off, "CUTOFF_APPROACHING")).toHaveLength(0);

    const met = await insertBlock(db(), { id: blockId(), cutoffOffset: 14 });
    await insertSnapshot(db(), met, 0, 80);
    await run(met);
    expect(await alertsOf(met, "CUTOFF_APPROACHING")).toHaveLength(0);
  });
});

describe("recordEvaluation: SNAPSHOT_STALE", () => {
  for (const age of [7, 14, 21]) {
    it(`is raised once when the latest snapshot is ${age} days old`, async () => {
      const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 25 });
      await insertSnapshot(db(), id, age, 50);
      const first = await run(id);
      const stale = first.alerts.filter((a) => a.type === "SNAPSHOT_STALE");
      expect(stale.map((a) => a.dedupeKey)).toEqual([
        `${addDays(TODAY, -age)}:${age}`,
      ]);
      expect((await run(id)).alerts).toEqual([]);
    });
  }

  it("is not raised for other ages or when no snapshot exists", async () => {
    const odd = await insertBlock(db(), { id: blockId(), cutoffOffset: 25 });
    await insertSnapshot(db(), odd, 10, 50);
    await run(odd);
    const none = await insertBlock(db(), { id: blockId(), cutoffOffset: 25 });
    await run(none);
    expect(await alertsOf(odd, "SNAPSHOT_STALE")).toHaveLength(0);
    expect(await alertsOf(none, "SNAPSHOT_STALE")).toHaveLength(0);
  });

  it("is only raised while the cutoff is 1 to 60 days away", async () => {
    const tooFar = await insertBlock(db(), { id: blockId(), cutoffOffset: 61 });
    await insertSnapshot(db(), tooFar, 7, 50);
    await run(tooFar);
    expect(await alertsOf(tooFar, "SNAPSHOT_STALE")).toHaveLength(0);

    const edge = await insertBlock(db(), { id: blockId(), cutoffOffset: 60 });
    await insertSnapshot(db(), edge, 7, 50);
    await run(edge);
    expect(await alertsOf(edge, "SNAPSHOT_STALE")).toHaveLength(1);

    const onCutoff = await insertBlock(db(), {
      id: blockId(),
      cutoffOffset: 0,
    });
    await insertSnapshot(db(), onCutoff, 7, 50);
    await run(onCutoff);
    expect(await alertsOf(onCutoff, "SNAPSHOT_STALE")).toHaveLength(0);
  });
});

describe("recordEvaluation: webhook deliveries", () => {
  it("queues one pending delivery per new alert per active endpoint, once", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 20 });
    const a = await insertEndpoint(db());
    const b = await insertEndpoint(db());
    await insertEndpoint(db(), false);

    const { alerts } = await run(id);
    expect(alerts).toHaveLength(1);
    const deliveries = await db().select().from(webhookDeliveries);
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((d) => d.endpointId).sort()).toEqual([a, b].sort());
    for (const delivery of deliveries) {
      expect(delivery.status).toBe("pending");
      expect(delivery.attempts).toBe(0);
      expect(delivery.nextAttemptAt).toEqual(NOW);
      expect(delivery.eventType).toBe("RISK_LEVEL_CHANGED");
      expect(delivery.alertEventId).toBe(alerts[0]?.id);
      const body = delivery.body as {
        id: string;
        type: string;
        createdAt: string;
        block: object;
      };
      expect(body.id).toBe(alerts[0]?.id);
      expect(body.type).toBe("RISK_LEVEL_CHANGED");
      expect(body.createdAt).toBe("2026-10-06T08:00:00Z");
      expect(Object.keys(body.block).sort()).toEqual(
        ["currency", "cutoffDate", "hotelName", "id", "name"].sort(),
      );
    }

    await run(id);
    expect(await db().select().from(webhookDeliveries)).toHaveLength(2);
  });

  it("rolls everything back when the surrounding transaction fails", async () => {
    const id = await insertBlock(db(), { id: blockId(), cutoffOffset: 14 });
    await insertEndpoint(db());
    await expect(
      db().transaction(async (tx) => {
        await recordEvaluation(tx, id, TODAY, NOW);
        throw new Error("later step failed");
      }),
    ).rejects.toThrow("later step failed");
    expect(await db().select().from(evaluations)).toHaveLength(0);
    expect(await db().select().from(alertEvents)).toHaveLength(0);
    expect(await db().select().from(webhookDeliveries)).toHaveLength(0);
  });
});
