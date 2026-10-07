import { newId } from "@alihdrndm/blockpace-core";
import {
  alertEvents,
  evaluations,
  snapshotNights,
  snapshots,
  webhookDeliveries,
  webhookEndpoints,
} from "@alihdrndm/blockpace-db";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { API_KEY, TODAY, useTestApp } from "./support/app.js";

const { http, db } = useTestApp();

// TODAY (FIXED_TODAY) is 2026-10-06. The block has two nights of 10 rooms; minimum 8 per night.
const NIGHTS = ["2026-11-10", "2026-11-11"];
const MISSING = "01900000-0000-7000-8000-ffffffffffff";

const api = {
  put: (path: string, body: object) =>
    http().put(path).set("x-api-key", API_KEY).send(body),
  get: (path: string) => http().get(path).set("x-api-key", API_KEY),
  delete: (path: string) => http().delete(path).set("x-api-key", API_KEY),
  upload: (path: string, csv: string | Buffer) =>
    http()
      .post(path)
      .set("x-api-key", API_KEY)
      .attach("file", Buffer.from(csv), "pickup.csv"),
};

async function createBlock(): Promise<string> {
  const res = await http()
    .post("/v1/blocks")
    .set("x-api-key", API_KEY)
    .send({
      name: "Snapshot Summit",
      hotelName: "Example Inn",
      currency: "USD",
      cutoffDate: "2026-10-20",
      terms: { basis: "cumulative", allowedAttritionPct: 20 },
      nights: NIGHTS.map((date) => ({
        date,
        contractedRooms: 10,
        rateMinor: 10000,
      })),
    })
    .expect(201);
  return res.body.id;
}

const nights = (picked: number[], resold: number[] = []) =>
  NIGHTS.map((date, i) => ({
    date,
    pickedUpRooms: picked[i] ?? 0,
    ...(resold[i] === undefined ? {} : { resoldRooms: resold[i] }),
  }));

describe("PUT /v1/blocks/:id/snapshots/:asOfDate", () => {
  let blockId: string;
  let endpointIds: string[];

  beforeAll(async () => {
    blockId = await createBlock();
    endpointIds = [newId(), newId()];
    await db()
      .insert(webhookEndpoints)
      .values(
        endpointIds.map((id) => ({
          id,
          url: "https://hooks.example.com/x",
          secret: "s",
        })),
      );
  });

  it("creates a snapshot, evaluates in the same transaction and queues one delivery per endpoint", async () => {
    const res = await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-06`, {
        nights: nights([3, 4]),
        note: "from the hotel",
      })
      .expect(200);
    expect(res.body.snapshot).toMatchObject({
      blockId,
      asOfDate: "2026-10-06",
      source: "api",
      note: "from the hotel",
      nights: [
        { date: "2026-11-10", pickedUpRooms: 3, resoldRooms: 0 },
        { date: "2026-11-11", pickedUpRooms: 4, resoldRooms: 0 },
      ],
    });
    expect(res.body.evaluation).toMatchObject({
      pickedUpRoomNights: 7,
      shortfallRoomNights: 9,
      riskLevel: "at_risk",
    });

    const [stored] = await db()
      .select()
      .from(evaluations)
      .where(eq(evaluations.blockId, blockId));
    expect(stored?.riskLevel).toBe("at_risk");
    const alerts = await db()
      .select()
      .from(alertEvents)
      .where(eq(alertEvents.blockId, blockId));
    // First evaluation at_risk, and the cutoff (2026-10-20) is exactly 14 days away.
    expect(alerts.map((a) => a.type).sort()).toEqual([
      "CUTOFF_APPROACHING",
      "RISK_LEVEL_CHANGED",
    ]);
    for (const alert of alerts) {
      const deliveries = await db()
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.alertEventId, alert.id));
      expect(deliveries.map((d) => d.endpointId).sort()).toEqual(
        [...endpointIds].sort(),
      );
    }
  });

  it("replaces the snapshot for the same date (same id, new nights, note cleared) and stays idempotent", async () => {
    const first = (await api.get(`/v1/blocks/${blockId}/snapshots`).expect(200))
      .body[0];
    const res = await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-06`, {
        nights: nights([5, 5]),
      })
      .expect(200);
    expect(res.body.snapshot.id).toBe(first.id);
    expect(
      res.body.snapshot.nights.map(
        (n: { pickedUpRooms: number }) => n.pickedUpRooms,
      ),
    ).toEqual([5, 5]);
    expect("note" in res.body.snapshot).toBe(false);
    const again = await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-06`, {
        nights: nights([5, 5]),
      })
      .expect(200);
    expect(again.body.snapshot).toEqual(res.body.snapshot);
    const rows = await db()
      .select()
      .from(snapshots)
      .where(eq(snapshots.blockId, blockId));
    expect(rows).toHaveLength(1);
  });

  it("SNAPSHOT_NIGHTS_MISMATCH lists the missing and the extra dates", async () => {
    const body = {
      nights: [
        { date: "2026-11-10", pickedUpRooms: 1 },
        { date: "2026-11-12", pickedUpRooms: 1 },
      ],
    };
    const res = await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-05`, body)
      .expect(422);
    expect(res.body.code).toBe("SNAPSHOT_NIGHTS_MISMATCH");
    expect(res.body.detail).toContain("Missing nights: 2026-11-11");
    expect(res.body.detail).toContain("Extra nights: 2026-11-12");
  });

  it("SNAPSHOT_IN_FUTURE after today + 1 day; today + 1 itself is allowed", async () => {
    const res = await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-08`, {
        nights: nights([1, 1]),
      })
      .expect(422);
    expect(res.body.code).toBe("SNAPSHOT_IN_FUTURE");
    await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-07`, {
        nights: nights([6, 6]),
      })
      .expect(200);
    await api.delete(`/v1/blocks/${blockId}/snapshots/2026-10-07`).expect(204);
  });

  it("RESOLD_EXCEEDS_CONTRACTED when resold rooms are more than the night's contract", async () => {
    const res = await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-05`, {
        nights: nights([1, 1], [11, 0]),
      })
      .expect(422);
    expect(res.body.code).toBe("RESOLD_EXCEEDS_CONTRACTED");
    expect(res.body.detail).toContain("2026-11-10");
  });

  it("VALIDATION_FAILED for a bad date, duplicate nights or unknown keys; NOT_FOUND for an unknown block", async () => {
    expect(
      (
        await api
          .put(`/v1/blocks/${blockId}/snapshots/2026-02-30`, {
            nights: nights([1, 1]),
          })
          .expect(422)
      ).body.code,
    ).toBe("VALIDATION_FAILED");
    const twice = {
      nights: [
        { date: "2026-11-10", pickedUpRooms: 1 },
        { date: "2026-11-10", pickedUpRooms: 2 },
      ],
    };
    expect(
      (
        await api
          .put(`/v1/blocks/${blockId}/snapshots/2026-10-05`, twice)
          .expect(422)
      ).body.code,
    ).toBe("VALIDATION_FAILED");
    expect(
      (
        await api
          .put(`/v1/blocks/${blockId}/snapshots/2026-10-05`, {
            nights: nights([1, 1]),
            source: "csv",
          })
          .expect(422)
      ).body.code,
    ).toBe("VALIDATION_FAILED");
    expect(
      (
        await api
          .put(`/v1/blocks/${MISSING}/snapshots/2026-10-05`, {
            nights: nights([1, 1]),
          })
          .expect(404)
      ).body.code,
    ).toBe("NOT_FOUND");
  });
});

describe("SNAPSHOT_LIMIT (400 snapshots per block)", () => {
  it("rejects the 401st snapshot with 409 but still allows replacing an existing one", async () => {
    const blockId = await createBlock();
    // 400 snapshots on consecutive days ending 2026-10-05, written straight to the database.
    const rows = Array.from({ length: 400 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 9, 5 - i)).toISOString().slice(0, 10);
      return { id: newId(), blockId, asOfDate: day, source: "api" };
    });
    await db().insert(snapshots).values(rows);
    await db()
      .insert(snapshotNights)
      .values(
        rows.flatMap((r) =>
          NIGHTS.map((night) => ({
            snapshotId: r.id,
            night,
            pickedUpRooms: 1,
          })),
        ),
      );

    const res = await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-06`, {
        nights: nights([2, 2]),
      })
      .expect(409);
    expect(res.body.code).toBe("SNAPSHOT_LIMIT");
    await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-05`, {
        nights: nights([2, 2]),
      })
      .expect(200);
    const csv =
      "as_of_date,night,picked_up\n2026-10-06,2026-11-10,1\n2026-10-06,2026-11-11,1\n";
    expect(
      (
        await api
          .upload(`/v1/blocks/${blockId}/snapshots/import`, csv)
          .expect(409)
      ).body.code,
    ).toBe("SNAPSHOT_LIMIT");
  });
});

describe("GET and DELETE /v1/blocks/:id/snapshots", () => {
  it("lists snapshots oldest first, deletes one and re-evaluates", async () => {
    const blockId = await createBlock();
    await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-06`, {
        nights: nights([8, 8]),
      })
      .expect(200);
    await api
      .put(`/v1/blocks/${blockId}/snapshots/2026-10-01`, {
        nights: nights([2, 2]),
      })
      .expect(200);
    const list = (await api.get(`/v1/blocks/${blockId}/snapshots`).expect(200))
      .body;
    expect(list.map((s: { asOfDate: string }) => s.asOfDate)).toEqual([
      "2026-10-01",
      "2026-10-06",
    ]);

    await api.delete(`/v1/blocks/${blockId}/snapshots/2026-10-06`).expect(204);
    const [row] = await db()
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.blockId, blockId),
          eq(evaluations.evaluatedFor, TODAY),
        ),
      );
    // Only the 2026-10-01 report is left: 4 picked up of a 16-room minimum.
    const result = row?.result as { pickedUpRoomNights: number } | undefined;
    expect(result?.pickedUpRoomNights).toBe(4);
  });

  it("NOT_FOUND for an unknown block or snapshot date", async () => {
    const blockId = await createBlock();
    expect(
      (await api.get(`/v1/blocks/${MISSING}/snapshots`).expect(404)).body.code,
    ).toBe("NOT_FOUND");
    expect(
      (
        await api
          .delete(`/v1/blocks/${blockId}/snapshots/2026-10-01`)
          .expect(404)
      ).body.code,
    ).toBe("NOT_FOUND");
    expect(
      (
        await api
          .delete(`/v1/blocks/${MISSING}/snapshots/2026-10-01`)
          .expect(404)
      ).body.code,
    ).toBe("NOT_FOUND");
  });
});

describe("POST /v1/blocks/:id/snapshots/import", () => {
  it("imports every as_of_date group in one go, case-insensitive header in any order", async () => {
    const blockId = await createBlock();
    const csv = [
      "Night,AS_OF_DATE,Picked_Up,Resold",
      "2026-11-10,2026-09-29,3,",
      "2026-11-11,2026-09-29,4,0",
      "2026-11-10,2026-10-06,6,1",
      "2026-11-11,2026-10-06,7,0",
    ].join("\n");
    const res = await api
      .upload(`/v1/blocks/${blockId}/snapshots/import`, csv)
      .expect(200);
    expect(res.body).toEqual({ snapshots: 2 });
    const list = (await api.get(`/v1/blocks/${blockId}/snapshots`).expect(200))
      .body;
    expect(list.map((s: { source: string }) => s.source)).toEqual([
      "csv",
      "csv",
    ]);
    expect(list[1].nights[0]).toEqual({
      date: "2026-11-10",
      pickedUpRooms: 6,
      resoldRooms: 1,
    });
    const [row] = await db()
      .select()
      .from(evaluations)
      .where(eq(evaluations.blockId, blockId));
    const result = row?.result as { snapshotAsOf: string } | undefined;
    expect(result?.snapshotAsOf).toBe("2026-10-06");
  });

  it("IMPORT_INVALID: bad header, bad cells and incomplete groups, all-or-nothing", async () => {
    const blockId = await createBlock();
    const header = await api
      .upload(
        `/v1/blocks/${blockId}/snapshots/import`,
        "date,night,picked_up\n2026-10-01,2026-11-10,1\n",
      )
      .expect(422);
    expect(header.body.code).toBe("IMPORT_INVALID");
    expect(header.body.errors.map((e: { path: string }) => e.path)).toEqual([
      "row 1",
      "row 1",
    ]);

    const csv = [
      "as_of_date,night,picked_up",
      "2026-10-01,2026-11-10,1",
      "2026-10-01,2026-11-11,lots",
      "2026-10-02,2026-11-10,2",
      "2026-10-03,2026-11-10,1",
      "2026-10-03,2026-11-11,1",
    ].join("\n");
    const res = await api
      .upload(`/v1/blocks/${blockId}/snapshots/import`, csv)
      .expect(422);
    expect(res.body.code).toBe("IMPORT_INVALID");
    const paths = res.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toContain("row 3");
    expect(paths).toContain("row 4");
    // The valid 2026-10-03 group was not saved either: the whole file is rejected.
    expect(
      await db().select().from(snapshots).where(eq(snapshots.blockId, blockId)),
    ).toHaveLength(0);
  });

  it("IMPORT_INVALID without a file, PAYLOAD_TOO_LARGE above 1 MB, NOT_FOUND for an unknown block", async () => {
    const blockId = await createBlock();
    const none = await http()
      .post(`/v1/blocks/${blockId}/snapshots/import`)
      .set("x-api-key", API_KEY)
      .expect(422);
    expect(none.body.code).toBe("IMPORT_INVALID");
    const big = Buffer.alloc(1024 * 1024 + 1, "a");
    expect(
      (
        await api
          .upload(`/v1/blocks/${blockId}/snapshots/import`, big)
          .expect(413)
      ).body.code,
    ).toBe("PAYLOAD_TOO_LARGE");
    const csv =
      "as_of_date,night,picked_up\n2026-10-01,2026-11-10,1\n2026-10-01,2026-11-11,1\n";
    expect(
      (
        await api
          .upload(`/v1/blocks/${MISSING}/snapshots/import`, csv)
          .expect(404)
      ).body.code,
    ).toBe("NOT_FOUND");
  });
});
