import { defineConfig } from "@playwright/test";

// The smoke test runs the real stack: the NestJS API on a seeded database and the Next.js app,
// both with today frozen at 2026-10-06. Ports differ from the dev ports (4020/3020) so a running
// dev stack does not interfere.
const API_PORT = 4920;
const WEB_PORT = 3920;
const API_KEY = "e2e-key";
const FIXED_TODAY = "2026-10-06";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: "list",
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure" },
  webServer: [
    {
      // Database first (needs `pnpm db:up`), then the API from a fresh build.
      command:
        "tsx e2e/prepare-db.ts && pnpm --filter api run build && node ../api/dist/main.js",
      url: `http://localhost:${API_PORT}/readyz`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: String(API_PORT),
        DATABASE_URL:
          "postgres://blockpace:blockpace@localhost:5442/blockpace_e2e",
        API_KEY,
        FIXED_TODAY,
      },
    },
    {
      command: `next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/calculator`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        API_BASE_URL: `http://localhost:${API_PORT}`,
        API_KEY,
        FIXED_TODAY,
      },
    },
  ],
});
