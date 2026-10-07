import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { addDays, type IsoDate, newId } from "@alihdrndm/blockpace-core";
import {
  blockNights,
  blocks,
  createDb,
  createPool,
  type Db,
  webhookDeliveries,
  webhookEndpoints,
} from "@alihdrndm/blockpace-db";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, inject } from "vitest";
import { ClockService } from "../clock.service.js";
import type { Config } from "../config.js";

export const TODAY = "2026-10-06" as IsoDate;

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: "test",
    DATABASE_URL: inject("dbUrl"),
    FIXED_TODAY: TODAY,
    ALLOW_PRIVATE_WEBHOOK_TARGETS: true,
    WEBHOOK_POLL_MS: 60_000,
    WEBHOOK_TIMEOUT_MS: 2_000,
    ...overrides,
  };
}

/** A clock the test moves by hand, so retry times are exact. */
export class TestClock extends ClockService {
  current = new Date("2026-10-06T08:00:00Z");

  override now(): Date {
    return new Date(this.current);
  }

  advanceTo(date: Date): void {
    this.current = new Date(date);
  }
}

/** A pool on the shared test database; every table is emptied before each test. */
export function useTestDb(): { db: () => Db; newDb: () => Db } {
  const pools: ReturnType<typeof createPool>[] = [];
  const open = () => {
    const pool = createPool(inject("dbUrl"));
    pools.push(pool);
    return createDb(pool);
  };
  const db = open();
  beforeEach(async () => {
    await db.execute(sql`truncate table blocks, webhook_endpoints cascade`);
  });
  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
  });
  // newDb opens a second, independent pool: a second worker process in the concurrency test.
  return { db: () => db, newDb: open };
}

export async function insertBlock(
  db: Db,
  options: { status?: "active" | "closed"; nights?: boolean } = {},
): Promise<string> {
  const id = newId();
  const night = addDays(TODAY, 40);
  await db.insert(blocks).values({
    id,
    name: "Test block",
    hotelName: "Test hotel",
    currency: "USD",
    startDate: night,
    endDate: night,
    cutoffDate: addDays(TODAY, 20),
    status: options.status ?? "active",
    basis: "cumulative",
    allowedAttritionBps: 2000,
    damagesBps: 10000,
    taxBps: 0,
    resellCredit: false,
    minimumRounding: "ceil",
  });
  // A block without nights cannot be evaluated: the failure case for the daily job.
  if (options.nights !== false) {
    await db
      .insert(blockNights)
      .values({ blockId: id, night, contractedRooms: 100, rateMinor: 10000 });
  }
  return id;
}

export async function insertEndpoint(
  db: Db,
  url: string,
  secret = "test-secret",
): Promise<string> {
  const id = newId();
  await db.insert(webhookEndpoints).values({ id, url, secret });
  return id;
}

export async function insertDelivery(
  db: Db,
  endpointId: string,
  nextAttemptAt: Date,
  body: Record<string, unknown> = { type: "PING" },
): Promise<string> {
  const id = newId();
  await db.insert(webhookDeliveries).values({
    id,
    endpointId,
    eventType: "PING",
    body: { id, ...body },
    status: "pending",
    nextAttemptAt,
  });
  return id;
}

export interface ReceivedRequest {
  headers: IncomingMessage["headers"];
  body: string;
}

/** A local webhook receiver. `respond` decides each answer; every request is recorded. */
export async function startReceiver(
  respond: (request: ReceivedRequest) => {
    status: number;
    headers?: Record<string, string>;
    delayMs?: number;
  } | null,
): Promise<{
  url: string;
  received: ReceivedRequest[];
  close: () => Promise<void>;
}> {
  const received: ReceivedRequest[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const request = {
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      received.push(request);
      const answer = respond(request);
      // null = never answer, to provoke a timeout.
      if (answer === null) return;
      setTimeout(() => {
        res.writeHead(answer.status, answer.headers ?? {});
        res.end();
      }, answer.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
