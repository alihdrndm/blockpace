import pg from "pg";

// One pool per process; max 10 connections per the database conventions.
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
}
