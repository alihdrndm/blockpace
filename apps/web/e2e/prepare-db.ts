// Prepares the smoke-test database: a separate `blockpace_e2e` database on the compose
// PostgreSQL (so the developer's own data in `blockpace` is never touched), migrated and
// seeded with today = 2026-10-06, the date the spec's expected numbers assume.
import type { IsoDate } from "@alihdrndm/blockpace-core";
import { createDb, createPool, migrate, seed } from "@alihdrndm/blockpace-db";

const ADMIN_URL = "postgres://blockpace:blockpace@localhost:5442/blockpace";
const E2E_DB = "blockpace_e2e";

const admin = createPool(ADMIN_URL);
await admin.query(`drop database if exists ${E2E_DB} with (force)`);
await admin.query(`create database ${E2E_DB}`);
await admin.end();

const url = new URL(ADMIN_URL);
url.pathname = `/${E2E_DB}`;
const pool = createPool(url.toString());
const db = createDb(pool);
await migrate(db);
await seed(db, {
  today: "2026-10-06" as IsoDate,
  webhookUrl: "http://localhost:4999/",
});
await pool.end();
console.log(`prepared ${E2E_DB}`);
