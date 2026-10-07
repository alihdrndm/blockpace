import type { IsoDate } from "@alihdrndm/blockpace-core";
import { sql } from "drizzle-orm";
import { createDb, createPool } from "./client.js";
import { loadDbEnv } from "./env.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

// db:migrate, db:seed and db:reset. The clock rule applies here too: "today" is the UTC date
// unless FIXED_TODAY is set.
const command = process.argv[2];
const env = loadDbEnv();
const pool = createPool(env.DATABASE_URL);
const db = createDb(pool);

try {
  if (command === "migrate") {
    await migrate(db);
    console.log("migrations applied");
  } else if (command === "seed") {
    const today = (env.FIXED_TODAY ??
      new Date().toISOString().slice(0, 10)) as IsoDate;
    await seed(db, { today, webhookUrl: env.SEED_WEBHOOK_URL });
    console.log(`seeded demo data for ${today}`);
  } else if (command === "reset") {
    // Drop everything, including drizzle's own bookkeeping schema, then rebuild from migrations.
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db);
    const today = (env.FIXED_TODAY ??
      new Date().toISOString().slice(0, 10)) as IsoDate;
    await seed(db, { today, webhookUrl: env.SEED_WEBHOOK_URL });
    console.log("database reset, migrated and seeded");
  } else {
    console.error("usage: cli.ts migrate | seed | reset");
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
