import type { IsoDate } from "@alihdrndm/blockpace-core";
import { seed } from "@alihdrndm/blockpace-db";
import { describe, expect, it } from "vitest";
import { API_KEY, TODAY, useTestApp } from "./support/app.js";

const { http, db } = useTestApp();

const newBlock = (overrides: object = {}) => ({
  name: "Spring Summit",
  hotelName: "Example Grand",
  currency: "USD",
  cutoffDate: "2026-11-01",
  terms: { basis: "cumulative", allowedAttritionPct: 15, damagesPct: 80 },
  nights: [
    { date: "2026-11-11", contractedRooms: 60, rateMinor: 18900 },
    { date: "2026-11-10", contractedRooms: 45, rateMinor: 18900 },
  ],
  ...overrides,
});

const api = {
  post: (path: string, body: object) =>
    http().post(path).set("x-api-key", API_KEY).send(body),
  get: (path: string) => http().get(path).set("x-api-key", API_KEY),
  delete: (path: string) => http().delete(path).set("x-api-key", API_KEY),
};

const MISSING = "01900000-0000-7000-8000-ffffffffffff";

describe("POST /v1/blocks", () => {
  it("creates a block: 201 with sorted nights, derived start/end dates and default terms", async () => {
    const res = await api.post("/v1/blocks", newBlock()).expect(201);
    expect(res.body).toMatchObject({
      name: "Spring Summit",
      status: "active",
      startDate: "2026-11-10",
      endDate: "2026-11-11",
      terms: {
        basis: "cumulative",
        allowedAttritionPct: 15,
        damagesPct: 80,
        taxPct: 0,
        resellCredit: false,
        minimumRounding: "ceil",
      },
      nights: [
        { date: "2026-11-10", contractedRooms: 45, rateMinor: 18900 },
        { date: "2026-11-11", contractedRooms: 60, rateMinor: 18900 },
      ],
    });
    expect(res.body.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
  });

  it("VALIDATION_FAILED: nights not consecutive, duplicated, cutoff after first night, bad name", async () => {
    const cases = [
      newBlock({
        nights: [
          { date: "2026-11-10", contractedRooms: 1, rateMinor: 1 },
          { date: "2026-11-12", contractedRooms: 1, rateMinor: 1 },
        ],
      }),
      newBlock({
        nights: [
          { date: "2026-11-10", contractedRooms: 1, rateMinor: 1 },
          { date: "2026-11-10", contractedRooms: 1, rateMinor: 1 },
        ],
      }),
      newBlock({ cutoffDate: "2026-11-11" }),
      newBlock({ name: "" }),
      newBlock({ surprise: true }),
    ];
    for (const body of cases) {
      const res = await api.post("/v1/blocks", body).expect(422);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("GET /v1/blocks/:id and DELETE", () => {
  it("returns the block, then 404 after it is deleted", async () => {
    const { body: created } = await api
      .post("/v1/blocks", newBlock())
      .expect(201);
    const { body } = await api.get(`/v1/blocks/${created.id}`).expect(200);
    expect(body).toEqual(created);

    await api.delete(`/v1/blocks/${created.id}`).expect(204);
    expect(
      (await api.get(`/v1/blocks/${created.id}`).expect(404)).body.code,
    ).toBe("NOT_FOUND");
    expect(
      (await api.delete(`/v1/blocks/${created.id}`).expect(404)).body.code,
    ).toBe("NOT_FOUND");
  });

  it("NOT_FOUND for an unknown id and VALIDATION_FAILED for a non-UUID id", async () => {
    expect((await api.get(`/v1/blocks/${MISSING}`).expect(404)).body.code).toBe(
      "NOT_FOUND",
    );
    expect((await api.get("/v1/blocks/not-a-uuid").expect(422)).body.code).toBe(
      "VALIDATION_FAILED",
    );
  });
});

describe("GET /v1/blocks", () => {
  it("lists the seed blocks with today's risk summary and no nights", async () => {
    await seed(db(), {
      today: TODAY as IsoDate,
      webhookUrl: "http://localhost:4999/",
    });
    const { body } = await api.get("/v1/blocks?limit=200").expect(200);
    const byHotel = Object.fromEntries(
      (
        body.items as { hotelName: string; latest: object; nights?: unknown }[]
      ).map((b) => [b.hotelName, b]),
    );
    expect(byHotel["Harborview Hotel"]?.latest).toEqual({
      riskLevel: "on_track",
      pickupPct: 64.5,
      shortfallRoomNights: 41,
      totalMinor: 666660,
      projectedTotalMinor: 0,
      snapshotAsOf: TODAY,
    });
    expect(byHotel["Courtyard Annex"]?.latest).toMatchObject({
      riskLevel: "at_risk",
      projectedTotalMinor: 105120,
    });
    expect(byHotel["Lakeside Resort"]?.latest).toMatchObject({
      riskLevel: "met",
      totalMinor: 0,
    });
    expect(body.items.every((b: object) => !("nights" in b))).toBe(true);
  });

  it("pages newest first with an opaque cursor", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        (
          await api
            .post("/v1/blocks", newBlock({ name: `Paging ${i}` }))
            .expect(201)
        ).body.id,
      );
    }
    const first = (await api.get("/v1/blocks?limit=2").expect(200)).body;
    expect(first.items).toHaveLength(2);
    expect(first.items[0].id).toBe(ids[2]);
    expect(first.items[1].id).toBe(ids[1]);
    expect(typeof first.nextCursor).toBe("string");

    const second = (
      await api.get(`/v1/blocks?limit=2&cursor=${first.nextCursor}`).expect(200)
    ).body;
    expect(second.items[0].id).toBe(ids[0]);
  });

  it("filters by status and rejects bad paging input", async () => {
    const { body } = await api.get("/v1/blocks?status=closed").expect(200);
    expect(body.items).toEqual([]);
    expect("nextCursor" in body).toBe(false);
    for (const query of [
      "limit=0",
      "limit=201",
      "cursor=nope",
      "status=open",
      "page=2",
    ]) {
      expect(
        (await api.get(`/v1/blocks?${query}`).expect(422)).body.code,
        query,
      ).toBe("VALIDATION_FAILED");
    }
  });
});
