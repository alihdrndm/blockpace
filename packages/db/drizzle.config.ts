import { defineConfig } from "drizzle-kit";

// Used only by `drizzle-kit generate` (schema -> SQL files in ./drizzle). Migrations are applied
// by migrate.ts, never by `drizzle-kit push`, and generating needs no database connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
