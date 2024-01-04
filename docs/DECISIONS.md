# Decisions and deviations

Format: date, what HANDOFF.md said, what was done, why.

## 2026-10-07 — No commits by the assistant
- **HANDOFF.md (OP3, Git):** commit at the end of each milestone.
- **Done:** `git init -b main` only. The owner stages and commits; each milestone report suggests a Conventional Commit message.
- **Why:** the owner asked to do staging, committing and pushing personally.

## 2026-10-07 — Docker not installed on the dev machine at M0
- **HANDOFF.md (M0 AC):** `pnpm db:up` then `curl localhost:4020/readyz` → 200.
- **Done:** everything else in M0 is built and verified; that single check is run once Docker is available.
- **Why:** Docker was not installed when M0 was built.

## 2026-10-07 — Packages are built before typecheck, test and e2e
- **HANDOFF.md (Root scripts):** `typecheck` is `tsc --noEmit` in every workspace package.
- **Done:** root `typecheck`, `test` and `test:e2e` first run `build:packages` (builds `packages/*`), because the apps import `@alihdrndm/blockpace-core` and `-db` through their built `dist/` output.
- **Why:** keeps `verify` order as specified without TypeScript project references or running TS from `node_modules` at runtime.

## 2026-10-07 — Tool versions installed at M0
- **HANDOFF.md:** latest stable of each tool. Installed: TypeScript 7.0.2, Biome 2.5.15, Vitest 5.0.3, NestJS 12.x, pnpm 12.9.1.
- **Done:** Biome 2.5 deprecates `linter.rules.recommended`, so `biome.json` uses `"preset": "recommended"`. The NestJS scaffold's `*.e2e-spec.ts` / `*.spec.ts` naming was changed to `*.e2e.test.ts` / `*.test.ts` as HANDOFF.md requires; its oxlint/prettier configs and scripts were removed (Biome is the single tool).

## 2026-10-07 — TypeScript 6 in `apps/api` and `apps/worker`
- **HANDOFF.md:** latest stable TypeScript everywhere.
- **Done:** root and packages use TypeScript 7.0.2; `apps/api` and `apps/worker` pin `typescript@^6` as a devDependency.
- **Why:** the Nest CLI (`nest build`) needs the programmatic compiler API, which TypeScript 7.0 does not ship (the CLI says it returns in 7.1). Revisit when 7.1 is out.

## 2026-10-07 — Local `.env` handling
- **HANDOFF.md:** `.env` is git-ignored and config is read only in `config.ts`; it does not say how `.env` reaches the process.
- **Done:** `pnpm db:up` runs `scripts/ensure-env.mjs` (copies `.env.example` to `.env` if missing); the api and worker `dev`/`start` scripts pass `--env-file ../../.env` to the Nest CLI.
- **Why:** `DATABASE_URL` is required, so a fresh clone needs a `.env` before the API can boot.

## 2026-10-07 — Vitest config in `apps/api` and `apps/worker`
- **HANDOFF.md:** keep the NestJS scaffold's generated Vitest configuration.
- **Done:** kept (`vite-tsconfig-paths`, `globals`, `root`); only `include` was changed to `*.test.ts` / `*.e2e.test.ts` and the scaffold's `test:cov` script folded into `test` (`vitest run --coverage`).
- **Why:** HANDOFF.md fixes the test file naming and requires `pnpm test` to run with coverage. Thresholds are enforced only in `packages/core`; `apps/web` has no tests yet, so its `test` script passes without coverage.

## 2026-10-07 — Playwright installed at the repo root in M0
- **HANDOFF.md:** one Playwright smoke test, written in M5.
- **Done:** `@playwright/test` is a root devDependency from M0.
- **Why:** the CI `e2e` job runs `pnpm exec playwright install` from the first push.

## 2026-10-07 — `zod` in `apps/web`
- **HANDOFF.md (OP7):** the web app's allowed runtime dependencies are Next.js, React, Tailwind, `recharts`.
- **Done:** `apps/web` also depends on `zod` (for `src/env.ts`).
- **Why:** HANDOFF.md requires environment parsing with Zod ("Validation") and names `apps/web/src/env.ts` as the web config file.

## 2026-10-07 — M0 readiness check proved
- Docker Desktop 4.94 installed; `pnpm db:up` brought `db` to Healthy and the built API (`node --env-file=.env apps/api/dist/main.js`) answered `GET /readyz` with 200. The earlier "not proved" note above is now closed.

## 2026-10-07 — Per-night `shortfallRooms` is measured after resell credit
- **HANDOFF.md:** `Evaluation.nights[].shortfallRooms` exists on the per_night basis but does not say before or after resell credit.
- **Done:** it is `S_i` (after credit), so the nightly figures add up to `shortfallRoomNights`. The pre-credit total is `shortfallBeforeCredit`.
- **Why:** the owner chose this; the dashboard's nightly table then matches the bill.

## 2026-10-07 — Extra helpers in `packages/core` beyond the named functions
- **HANDOFF.md:** `plain-date.ts` lists five functions; the library lists `evaluate`, `forecast`, `riskLevel`.
- **Done:** added `tryParseIsoDate` (non-throwing, used by Zod and the API config), `calc.ts` (arithmetic shared by `evaluate` and `forecast` so each formula exists once), `refineBlockNights` and `checkSnapshotAgainstBlock` (night rules and snapshot checks that the M3 API reuses), and `src/testing/fixtures.ts` (test-only, excluded from the build and from coverage).
- **Why:** keeps the rules in one place for M3 instead of re-implementing them. `eachNight(first, count)` returns the `count` nights starting at `first`.

## 2026-10-07 — Fixture file shape
- **HANDOFF.md:** "worked-example JSON" in `fixtures/`, no shape given.
- **Done:** `fixtures/we1.json`, `we2.json`, `we3.json`; each has a base block, snapshots, `cases` (one per basis, with expected numbers copied from HANDOFF.md) and optional `variants` (WE1 damages 80%, WE2b, WE2c). WE2b/WE2c live inside `we2.json`.
- **Why:** one source of truth that tests load, so numbers are not retyped in test code.
