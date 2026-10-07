import type { IsoDate } from "@alihdrndm/blockpace-core";
import {
  type LookupAddresses,
  SEED_BLOCKS,
  SEED_ENDPOINT_ID,
  seed,
  webhookDeliveries,
  webhookEndpoints,
} from "@alihdrndm/blockpace-db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { API_KEY, TODAY, useTestApp } from "./support/app.js";

// A fake DNS so the URL rule never touches the network.
const lookup: LookupAddresses = async (host) => {
  if (host === "hooks.example.com")
    return [{ address: "93.184.216.34", family: 4 }];
  if (host === "internal.example.com")
    return [{ address: "10.0.0.5", family: 4 }];
  throw new Error("ENOTFOUND");
};

const { http, db } = useTestApp(
  { ALLOW_PRIVATE_WEBHOOK_TARGETS: false },
  { lookup },
);
const api = {
  post: (path: string, body?: object) =>
    http().post(path).set("x-api-key", API_KEY).send(body),
  get: (path: string) => http().get(path).set("x-api-key", API_KEY),
  delete: (path: string) => http().delete(path).set("x-api-key", API_KEY),
};
const MISSING = "01900000-0000-7000-8000-ffffffffffff";

beforeAll(async () => {
  // The seed raises alerts for the TechConf blocks and queues deliveries to the seed endpoint.
  await seed(db(), {
    today: TODAY as IsoDate,
    webhookUrl: "http://localhost:4999/",
  });
});

describe("POST /v1/webhook-endpoints", () => {
  it("creates an endpoint and returns a 64-hex-character secret only once", async () => {
    const res = await api
      .post("/v1/webhook-endpoints", {
        url: "https://hooks.example.com/blockpace",
      })
      .expect(201);
    expect(res.body).toMatchObject({
      url: "https://hooks.example.com/blockpace",
      active: true,
    });
    expect(res.body.secret).toMatch(/^[0-9a-f]{64}$/);

    const [stored] = await db()
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, res.body.id));
    expect(stored?.secret).toBe(res.body.secret);
    const list = (await api.get("/v1/webhook-endpoints").expect(200)).body;
    expect(JSON.stringify(list)).not.toContain(res.body.secret);
    expect(list.items.every((e: object) => !("secret" in e))).toBe(true);
  });

  it("WEBHOOK_URL_NOT_ALLOWED for http, private addresses and unresolvable hosts", async () => {
    for (const url of [
      "http://hooks.example.com/x",
      "https://internal.example.com/x",
      "https://10.1.2.3/x",
      "https://nowhere.example.com/x",
    ]) {
      const res = await api.post("/v1/webhook-endpoints", { url }).expect(422);
      expect(res.body.code, url).toBe("WEBHOOK_URL_NOT_ALLOWED");
      expect(res.body.detail.length).toBeGreaterThan(0);
    }
  });

  it("VALIDATION_FAILED for a missing or malformed url", async () => {
    expect(
      (await api.post("/v1/webhook-endpoints", {}).expect(422)).body.code,
    ).toBe("VALIDATION_FAILED");
    expect(
      (
        await api
          .post("/v1/webhook-endpoints", { url: "not a url" })
          .expect(422)
      ).body.code,
    ).toBe("VALIDATION_FAILED");
  });
});

describe("webhook endpoint list, delete and test", () => {
  it("pages endpoints newest first", async () => {
    for (let i = 0; i < 2; i++)
      await api
        .post("/v1/webhook-endpoints", {
          url: `https://hooks.example.com/p${i}`,
        })
        .expect(201);
    const first = (await api.get("/v1/webhook-endpoints?limit=1").expect(200))
      .body;
    expect(first.items[0].url).toBe("https://hooks.example.com/p1");
    const second = (
      await api
        .get(`/v1/webhook-endpoints?limit=1&cursor=${first.nextCursor}`)
        .expect(200)
    ).body;
    expect(second.items[0].url).toBe("https://hooks.example.com/p0");
  });

  it("POST /:id/test queues a PING delivery: 202 with body { id, type, createdAt }", async () => {
    const res = await api
      .post(`/v1/webhook-endpoints/${SEED_ENDPOINT_ID}/test`)
      .expect(202);
    expect(res.body).toMatchObject({
      endpointId: SEED_ENDPOINT_ID,
      eventType: "PING",
      status: "pending",
      attempts: 0,
    });
    expect("alertEventId" in res.body).toBe(false);
    const [row] = await db()
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, res.body.id));
    expect(row?.body).toEqual({
      id: res.body.id,
      type: "PING",
      createdAt: res.body.createdAt,
    });
  });

  it("DELETE removes the endpoint and its deliveries; NOT_FOUND afterwards and for test", async () => {
    const created = (
      await api
        .post("/v1/webhook-endpoints", {
          url: "https://hooks.example.com/gone",
        })
        .expect(201)
    ).body;
    await api.post(`/v1/webhook-endpoints/${created.id}/test`).expect(202);
    await api.delete(`/v1/webhook-endpoints/${created.id}`).expect(204);
    expect(
      await db()
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, created.id)),
    ).toHaveLength(0);
    expect(
      (await api.delete(`/v1/webhook-endpoints/${created.id}`).expect(404)).body
        .code,
    ).toBe("NOT_FOUND");
    expect(
      (await api.post(`/v1/webhook-endpoints/${MISSING}/test`).expect(404)).body
        .code,
    ).toBe("NOT_FOUND");
    expect(
      (await api.delete("/v1/webhook-endpoints/not-a-uuid").expect(422)).body
        .code,
    ).toBe("VALIDATION_FAILED");
  });
});

describe("GET /v1/alerts", () => {
  it("lists alerts newest first and filters by block", async () => {
    const all = (await api.get("/v1/alerts?limit=200").expect(200)).body.items;
    expect(all.length).toBeGreaterThan(0);
    const courtyard = SEED_BLOCKS[1]?.id ?? "";
    const forBlock = (
      await api.get(`/v1/alerts?blockId=${courtyard}`).expect(200)
    ).body.items;
    expect(forBlock.length).toBeGreaterThan(0);
    expect(
      forBlock.every((a: { blockId: string }) => a.blockId === courtyard),
    ).toBe(true);
    expect(forBlock[0]).toMatchObject({
      type: expect.any(String),
      dedupeKey: expect.any(String),
      payload: expect.any(Object),
    });
  });

  it("VALIDATION_FAILED for a non-UUID blockId or a bad cursor", async () => {
    expect(
      (await api.get("/v1/alerts?blockId=abc").expect(422)).body.code,
    ).toBe("VALIDATION_FAILED");
    expect((await api.get("/v1/alerts?cursor=abc").expect(422)).body.code).toBe(
      "VALIDATION_FAILED",
    );
  });
});

describe("GET /v1/webhook-deliveries", () => {
  it("filters by status and endpoint, newest first", async () => {
    const pending = (
      await api
        .get(
          `/v1/webhook-deliveries?status=pending&endpointId=${SEED_ENDPOINT_ID}`,
        )
        .expect(200)
    ).body.items;
    expect(pending.length).toBeGreaterThan(0);
    expect(
      pending.every(
        (d: { status: string; endpointId: string }) =>
          d.status === "pending" && d.endpointId === SEED_ENDPOINT_ID,
      ),
    ).toBe(true);
    // The PING queued in an earlier test is the newest delivery for the seed endpoint.
    expect(pending[0].eventType).toBe("PING");
    expect(
      (await api.get("/v1/webhook-deliveries?status=delivered").expect(200))
        .body.items,
    ).toEqual([]);
  });

  it("VALIDATION_FAILED for an unknown status", async () => {
    expect(
      (await api.get("/v1/webhook-deliveries?status=lost").expect(422)).body
        .code,
    ).toBe("VALIDATION_FAILED");
  });
});
