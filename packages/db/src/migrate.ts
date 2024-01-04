import { fileURLToPath } from "node:url";
import { migrate as run } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client.js";

// The SQL files live next to src/ and dist/, so one relative path works from both.
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies every pending SQL migration. Safe to call repeatedly. */
export async function migrate(db: Db): Promise<void> {
  await run(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
