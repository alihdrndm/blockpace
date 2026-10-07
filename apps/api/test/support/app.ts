import { createDb, createPool, type Db } from "@alihdrndm/blockpace-db";
import type { INestApplication } from "@nestjs/common";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, inject } from "vitest";
import type { AppOptions } from "../../src/app.module.js";
import { createApp } from "../../src/bootstrap.js";
import type { Config } from "../../src/config.js";

export const API_KEY = "test-key";
export const TODAY = "2026-10-06";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_URL: inject("dbUrl"),
    API_KEY,
    RUN_MIGRATIONS: false,
    FIXED_TODAY: TODAY,
    ALLOW_PRIVATE_WEBHOOK_TARGETS: false,
    WEBHOOK_POLL_MS: 10_000,
    WEBHOOK_TIMEOUT_MS: 5_000,
    ...overrides,
  };
}

export interface TestApp {
  app: () => INestApplication;
  /** supertest agent for the app; add `.set("x-api-key", API_KEY)` for /v1 calls. */
  http: () => ReturnType<typeof request>;
  db: () => Db;
}

/**
 * Starts the real app (same createApp as production) against the shared test database and
 * empties every table first, so each test file starts from nothing.
 */
export function useTestApp(
  overrides: Partial<Config> = {},
  options: AppOptions = {},
): TestApp {
  let app: INestApplication | undefined;
  const pool = createPool(inject("dbUrl"));
  const db = createDb(pool);

  beforeAll(async () => {
    await db.execute(sql`truncate table blocks, webhook_endpoints cascade`);
    app = await createApp(testConfig(overrides), options);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const current = () => {
    if (app === undefined) throw new Error("app not started");
    return app;
  };
  return {
    app: current,
    http: () => request(current().getHttpServer()),
    db: () => db,
  };
}
