import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

// One real PostgreSQL 17 (same image as compose.yaml) for the whole test run; no mocking.
// Each test file migrates what it needs and truncates tables between tests.
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer("postgres:17").start();
  project.provide("dbUrl", container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
