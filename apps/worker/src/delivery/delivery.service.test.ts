import { createHmac, timingSafeEqual } from "node:crypto";
import { type Db, webhookDeliveries } from "@alihdrndm/blockpace-db";
import { SchedulerRegistry } from "@nestjs/schedule";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../config.js";
import {
  insertDelivery,
  insertEndpoint,
  startReceiver,
  TestClock,
  testConfig,
  useTestDb,
} from "../testing/support.js";
import {
  BACKOFF_SECONDS,
  DeliveryService,
  type FetchFn,
} from "./delivery.service.js";

const { db, newDb } = useTestDb();
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

const noLookup = async () => {
  throw new Error("tests only use IP literals");
};

function makeService(
  options: {
    database?: Db;
    clock?: TestClock;
    config?: Partial<Config>;
    fetchFn?: FetchFn;
  } = {},
) {
  const config = testConfig(options.config);
  const clock = options.clock ?? new TestClock(config);
  const service = new DeliveryService(
    options.database ?? db(),
    clock,
    config,
    options.fetchFn ?? fetch,
    noLookup,
    new SchedulerRegistry(),
  );
  return { service, clock };
}

async function receiver(answer: Parameters<typeof startReceiver>[0]) {
  const r = await startReceiver(answer);
  closers.push(r.close);
  return r;
}

const rowOf = async (id: string) => {
  const [row] = await db()
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, id));
  if (row === undefined) throw new Error(`delivery ${id} missing`);
  return row;
};

describe("webhook delivery", () => {
  it("a 2xx answer marks the delivery delivered, with a signature the receiver can verify", async () => {
    const sink = await receiver(() => ({ status: 204 }));
    const { service, clock } = makeService();
    const endpoint = await insertEndpoint(db(), sink.url, "s3cret");
    const id = await insertDelivery(db(), endpoint, clock.now(), {
      type: "PING",
    });

    expect(await service.deliverDue()).toBe(1);

    const [request] = sink.received;
    if (request === undefined) throw new Error("nothing received");
    const timestamp = String(request.headers["x-blockpace-timestamp"]);
    expect(timestamp).toBe(String(Math.floor(clock.now().getTime() / 1000)));
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers["user-agent"]).toBe("blockpace-webhooks/1");
    expect(request.headers["x-blockpace-event"]).toBe("PING");
    expect(request.headers["x-blockpace-delivery"]).toBe(id);
    expect(JSON.parse(request.body)).toEqual({ id, type: "PING" });

    // Exactly what a receiver does: recompute the HMAC over "timestamp.rawBody" and compare.
    const expected = `v1=${createHmac("sha256", "s3cret").update(`${timestamp}.${request.body}`).digest("hex")}`;
    const given = String(request.headers["x-blockpace-signature"]);
    expect(timingSafeEqual(Buffer.from(given), Buffer.from(expected))).toBe(
      true,
    );

    const row = await rowOf(id);
    expect(row.status).toBe("delivered");
    expect(row.deliveredAt).toEqual(clock.now());
    expect(row.lastStatusCode).toBe(204);
    expect(row.updatedAt).toEqual(clock.now());
  });

  it("retry schedule: 1 min, 5 min, 30 min, 2 h, 12 h, then failed after 6 attempts", async () => {
    const sink = await receiver(() => ({ status: 500 }));
    const { service, clock } = makeService();
    const endpoint = await insertEndpoint(db(), sink.url);
    const id = await insertDelivery(db(), endpoint, clock.now());

    for (let attempt = 1; attempt <= 6; attempt++) {
      expect(await service.deliverDue()).toBe(1);
      const row = await rowOf(id);
      expect(row.attempts).toBe(attempt);
      expect(row.lastStatusCode).toBe(500);
      expect(row.lastError).toBe("HTTP 500");
      if (attempt < 6) {
        const wait = BACKOFF_SECONDS[attempt - 1] ?? 0;
        expect(row.status).toBe("pending");
        expect(row.nextAttemptAt.getTime() - clock.now().getTime()).toBe(
          wait * 1000,
        );
        // One second early: not due yet, nothing is sent.
        clock.advanceTo(new Date(row.nextAttemptAt.getTime() - 1000));
        expect(await service.deliverDue()).toBe(0);
        clock.advanceTo(row.nextAttemptAt);
      } else {
        expect(row.status).toBe("failed");
      }
    }
    clock.advanceTo(new Date(clock.now().getTime() + 86_400_000));
    expect(await service.deliverDue()).toBe(0);
    expect(sink.received).toHaveLength(6);
  });

  it("a 3xx answer is a failure and the redirect is not followed", async () => {
    const sink = await receiver(() => ({
      status: 302,
      headers: { location: "/elsewhere" },
    }));
    const { service, clock } = makeService();
    const id = await insertDelivery(
      db(),
      await insertEndpoint(db(), sink.url),
      clock.now(),
    );

    await service.deliverDue();

    expect(sink.received).toHaveLength(1);
    const row = await rowOf(id);
    expect(row).toMatchObject({
      status: "pending",
      attempts: 1,
      lastStatusCode: 302,
    });
  });

  it("a receiver that does not answer within WEBHOOK_TIMEOUT_MS is a failure", async () => {
    const sink = await receiver(() => null);
    const { service, clock } = makeService({
      config: { WEBHOOK_TIMEOUT_MS: 200 },
    });
    const id = await insertDelivery(
      db(),
      await insertEndpoint(db(), sink.url),
      clock.now(),
    );

    await service.deliverDue();

    const row = await rowOf(id);
    expect(row.attempts).toBe(1);
    expect(row.lastStatusCode).toBeNull();
    expect(row.lastError).toBe("timed out after 200 ms");
  });

  it("the webhook URL rule is checked again before every delivery", async () => {
    const sink = await receiver(() => ({ status: 204 }));
    // Private targets are allowed when the endpoint is created in dev, but not in this worker.
    const { service, clock } = makeService({
      config: { ALLOW_PRIVATE_WEBHOOK_TARGETS: false },
    });
    const id = await insertDelivery(
      db(),
      await insertEndpoint(db(), sink.url),
      clock.now(),
    );

    await service.deliverDue();

    expect(sink.received).toHaveLength(0);
    const row = await rowOf(id);
    expect(row.attempts).toBe(1);
    expect(row.lastError).toMatch(/^URL not allowed: /);
  });

  it("last_error keeps at most 500 characters", async () => {
    const failing: FetchFn = async () => {
      throw new Error("x".repeat(800));
    };
    const { service, clock } = makeService({ fetchFn: failing });
    const id = await insertDelivery(
      db(),
      await insertEndpoint(db(), "http://127.0.0.1:9/hook"),
      clock.now(),
    );

    await service.deliverDue();

    expect((await rowOf(id)).lastError).toHaveLength(500);
  });

  it("deliveries that are not due yet are left alone", async () => {
    const sink = await receiver(() => ({ status: 204 }));
    const { service, clock } = makeService();
    const later = new Date(clock.now().getTime() + 60_000);
    await insertDelivery(db(), await insertEndpoint(db(), sink.url), later);

    expect(await service.deliverDue()).toBe(0);
    expect(sink.received).toHaveLength(0);
  });

  it("two concurrent delivery loops never deliver the same row twice (FOR UPDATE SKIP LOCKED)", async () => {
    const sink = await receiver(() => ({ status: 200, delayMs: 15 }));
    const shared = new TestClock(testConfig());
    const a = makeService({ clock: shared });
    const b = makeService({ clock: shared, database: newDb() });
    const endpoint = await insertEndpoint(db(), sink.url);
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      ids.push(await insertDelivery(db(), endpoint, shared.now()));
    }

    // Each loop keeps polling until it finds nothing due, like two worker processes would.
    const drain = async (service: DeliveryService) => {
      while ((await service.deliverDue()) > 0) {
        // keep going
      }
    };
    await Promise.all([drain(a.service), drain(b.service)]);

    const sent = sink.received.map((r) =>
      String(r.headers["x-blockpace-delivery"]),
    );
    expect(sent).toHaveLength(30);
    expect(new Set(sent).size).toBe(30);
    for (const id of ids) {
      expect((await rowOf(id)).status).toBe("delivered");
    }
  });

  it("a tick is skipped while the previous one is still running", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sink = await receiver(() => ({ status: 204 }));
    const slowFetch: FetchFn = async (input, init) => {
      await gate;
      return fetch(input, init);
    };
    const { service, clock } = makeService({ fetchFn: slowFetch });
    await insertDelivery(
      db(),
      await insertEndpoint(db(), sink.url),
      clock.now(),
    );

    const first = service.tick();
    // Give the first tick time to reach the slow fetch.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await service.tick()).toBe("skipped");
    release();
    expect(await first).toBe("ran");
  });
});
