import { createDb, createPool, migrate } from "@alihdrndm/blockpace-db";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

// A real database, same image as compose.yaml, migrated once. No mocking of the database.
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer("postgres:17").start();
  const url = container.getConnectionUri();
  const pool = createPool(url);
  await migrate(createDb(pool));
  await pool.end();
  project.provide("dbUrl", url);
  return async () => {
    await container.stop();
  };
}
