import {
  drizzle,
  type NodePgDatabase,
  type NodePgQueryResultHKT,
} from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

// Both a Db and the transaction object passed to db.transaction() fit this type,
// so recordEvaluation can run inside whichever the caller already opened.
export type DbOrTx = PgDatabase<NodePgQueryResultHKT, typeof schema>;

// One pool per process; max 10 connections per the database conventions.
// The connect timeout makes an unreachable database fail fast instead of hanging /readyz.
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}
