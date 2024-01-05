import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: "./",
    include: ["test/**/*.e2e.test.ts"],
    // One real PostgreSQL 17 container for the whole run (see test/support/global-setup.ts).
    globalSetup: ["./test/support/global-setup.ts"],
    // Test files truncate the shared database, so they run one at a time.
    fileParallelism: false,
    hookTimeout: 240_000,
    testTimeout: 30_000,
  },
});
