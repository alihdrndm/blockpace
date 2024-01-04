import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["./src/testing/global-setup.ts"],
    // The first run pulls the postgres:17 image, which can take a minute.
    hookTimeout: 240_000,
    testTimeout: 30_000,
    // Files share one database and truncate it, so they must not run at the same time.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/testing/**", "src/cli.ts"],
    },
  },
});
