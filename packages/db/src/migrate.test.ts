import { sql } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";
import { createDb, createPool } from "./client.js";
import { migrate } from "./migrate.js";

const TABLES = [
  "alert_events",
  "block_nights",
  "blocks",
  "evaluations",
  "snapshot_nights",
  "snapshots",
  "webhook_deliveries",
  "webhook_endpoints",
];

describe("migrate", () => {
  it("builds every table in an empty database and can be run again safely", async () => {
    // A scratch database, so this test does not depend on what other test files left behind.
    const admin = createPool(inject("dbUrl"));
    await admin.query("drop database if exists migrate_test");
    await admin.query("create database migrate_test");
    await admin.end();

    const url = new URL(inject("dbUrl"));
    url.pathname = "/migrate_test";
    const pool = createPool(url.toString());
    const db = createDb(pool);
    try {
      await migrate(db);
      await migrate(db);
      const result = await db.execute(
        sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      );
      expect(result.rows.map((row) => row.table_name)).toEqual(TABLES);
    } finally {
      await pool.end();
    }
  });
});
