import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.test.ts"],
    // One real PostgreSQL 17 container for the whole run.
    globalSetup: ["./src/testing/global-setup.ts"],
    // Test files share and truncate that database, so they run one at a time.
    fileParallelism: false,
    hookTimeout: 240_000,
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/testing/**", "src/main.ts"],
    },
  },
});
