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

## 2026-10-07 — `IsoDateSchema` is a refined string, not a transform
- **HANDOFF.md:** OpenAPI schemas must be derived from the Zod schemas with `z.toJSONSchema()`.
- **Done:** `IsoDateSchema` validates with a regex plus a real-calendar-date refine and carries the `IsoDate` brand only in its TypeScript type. A test in `model.test.ts` proves `BlockSchema` and `EvaluationSchema` convert to JSON Schema.
- **Why:** an earlier version used `.transform()`, which Zod cannot represent in JSON Schema and would have broken the M3 Swagger docs (found by the M1 reviewer).

## 2026-10-07 — Duplicate nights in one snapshot
- `SnapshotSchema` rejects a snapshot that lists the same night twice (a `VALIDATION_FAILED` case in M3). `checkSnapshotAgainstBlock` therefore receives snapshots with unique nights and only reports missing, extra and over-resold nights.

## 2026-10-07 — `packages/db` reads two env variables in one file
- **HANDOFF.md:** `process.env` is read only in `apps/api/src/config.ts` and `apps/web/src/env.ts`.
- **Done:** `packages/db/src/env.ts` parses `DATABASE_URL`, `FIXED_TODAY` and `SEED_WEBHOOK_URL` for the `db:migrate`, `db:seed` and `db:reset` scripts. The API and worker never import it. The scripts load the root `.env` with `tsx --env-file-if-exists=../../.env`.
- **Why:** those three scripts run outside the API, so they need their own entry point. Owner approved. `zod` is a runtime dependency of `packages/db` only for this file.

## 2026-10-07 — Seed replaces its own rows by fixed id
- **HANDOFF.md:** `pnpm db:seed` is idempotent: running it twice leaves the same data.
- **Done:** the 3 demo blocks, their snapshots and the sink endpoint have fixed ids (`01900000-0000-7000-8000-...`). Each run deletes the three blocks (their nights, snapshots, evaluations, alerts and the deliveries of those alerts cascade) and recreates them relative to the clock's today. The sink endpoint is upserted, not deleted, so deliveries queued for other blocks survive; the upsert resets its `url`, `secret` and `active` to the seed values. Your own blocks are never touched. Alert ids and timestamps are new on each run; the alerts themselves (type and dedupe key) are identical.
- **Why:** owner chose this over "skip if present", which would leave stale dates on a later day. Block names are `TechConf` / `Sales Kickoff` and the hotel is a separate field (`Harborview Hotel`, `Courtyard Annex`, `Lakeside Resort`).

## 2026-10-07 — `recordEvaluation` details the spec leaves open
- Closed blocks still get their `evaluations` row; only alerts and deliveries are skipped (owner decision).
- Signature is `recordEvaluation(tx, blockId, today, now = new Date())`; the optional `now` sets alert `createdAt` and `next_attempt_at` so tests are deterministic. It returns `{ evaluation, alerts }` where `alerts` holds only rows inserted by this call.
- Ids come from `newId()` in `packages/core` (UUID v7 via the `uuid` package core already depends on), so `packages/db` needs no extra runtime dependency for ids.
- Percentages are stored as basis points (`*_bps` integers) exactly as the HANDOFF table says, although the general conventions mention `numeric(5,2)`; the table is the more specific rule.

## 2026-10-07 — Database tests need Docker
- `pnpm test` now includes `packages/db`, which starts a real `postgres:17` with Testcontainers (as the conventions require for API e2e tests). Docker must be running. CI runners have Docker.

## 2026-10-07 — Review fixes in M2
- `evaluations` has an `updated_at` column (mutable table per the naming convention); `recordEvaluation` sets it on every same-day overwrite.
- **HANDOFF.md:** every table has `id uuid` as primary key. **Done:** `block_nights` and `snapshot_nights` use only the composite keys the table specifies, (`block_id`, `night`) and (`snapshot_id`, `night`), with no `id` column. **Why:** the table row is more specific, and an extra id would add nothing a composite key does not already give.
- Alert `created_at` and `next_attempt_at` are truncated to whole seconds so the row and the RFC 3339 `createdAt` in its payload agree exactly.
- Callers in M3 and M4 must pass `clock.now()` as the fourth argument of `recordEvaluation`; the `new Date()` default exists for scripts only.

## 2026-10-07 — M3 slice 1: shared API schemas, evaluation loader, URL rule, line endings
- API request, query and response schemas live in `packages/core/src/api-schemas.ts` (Zod is the single source of truth; Swagger is generated from them). `PATCH /v1/blocks/:id` with an empty body is rejected as `VALIDATION_FAILED` because it would change nothing.
- `PUT` snapshots always store `source = "api"`, CSV imports store `"csv"`; `"manual"` is unused for now (owner decision).
- `packages/db` exports `loadEvaluationInput` and `termsFromRow` so live evaluations, the pace chart and the block list read blocks the same way `recordEvaluation` does.
- The webhook URL rule (`apps/api/src/webhooks/webhook-url.ts`) also blocks IPv4-mapped IPv6 addresses (`::ffff:10.0.0.1`) and `0.0.0.0/8`, and refuses a host that resolves to no address. These are stricter readings of "loopback, private ... unspecified".
- `.gitattributes` forces LF line endings so Windows checkouts with `core.autocrlf=true` match `.editorconfig` and Biome and do not show phantom changes.

## 2026-10-07 — pnpm build scripts denied explicitly
- pnpm 12 fails `pnpm install --frozen-lockfile` (CI) when a dependency has a build script that is neither allowed nor denied. `pnpm-workspace.yaml` denies the four that appear (`esbuild`, plus `cpu-features`, `protobufjs`, `ssh2` from Testcontainers); none is needed at runtime. This fixed the first CI runs, which failed at install.

## 2026-10-07 — M3 slice 2: API foundations
- **Validation and Swagger (OP5 check):** NestJS 12 validates `@Body({ schema })`, `@Query({ schema })` and `@Param({ schema })` with the built-in `StandardSchemaValidationPipe`, registered once as a global pipe with `transform: true` and a factory that builds the problem+json 422. `@nestjs/swagger` 12 reads Zod's Standard JSON Schema directly (`standardSchema` in `@ApiResponse`, and the decorator schemas for request bodies), so no converter is written.
- **Extra error codes:** HANDOFF.md names the global codes `VALIDATION_FAILED`, `NOT_FOUND`, `INTERNAL`, `UNAUTHORIZED` and `RATE_LIMITED`. Three more cases need a code: unreadable bodies (`BAD_REQUEST`, 400), oversized bodies (`PAYLOAD_TOO_LARGE`, 413) and `/readyz` failing (`UNAVAILABLE`, 503). All are in `docs/ERRORS.md`.
- **One app factory:** `apps/api/src/bootstrap.ts` builds the app for both `main.ts` and the e2e tests; `AppModule.register(config)` takes the parsed config, so tests pass a `Config` object instead of setting `process.env`.
- **Explicit `@Inject(...)`:** every constructor dependency names its token. Vitest compiles TypeScript without decorator metadata, so injection by type alone would work in `nest build` but fail in tests.
- **`NODE_ENV`** added to the API config: `production` = JSON logs, `development` = pino-pretty, `test` = silent.
- **`drizzle-orm` in `apps/api`** (OP7): API services query tables with the same Drizzle schema as `packages/db`.
- **Request id:** a caller-supplied `x-request-id` is reused when it is 1 to 200 characters, otherwise a UUID v7 is generated.
- **API key comparison:** both values are SHA-256 hashed and the digests compared with `crypto.timingSafeEqual`, so the comparison takes the same time whatever the key's length.
- The stateless calculator endpoint was built in slice 2 (not 3) because it is the first `/v1` route the auth, validation and docs tests need.
- 2026-10-07 follow-up: `@scarf/scarf` (install analytics, pulled in by Swagger UI) is denied too, and `strictDepBuilds: true` makes a local `pnpm install` fail the same way CI does, so a new unreviewed build script is caught before it is pushed.

## 2026-10-07 — Repository security and PR flow (owner request, beyond HANDOFF.md)
- **HANDOFF.md:** CI with `verify` and `e2e` jobs; `SECURITY.md` in M6. Nothing about branch protection or scanning.
- **Done (owner asked for open-source hygiene):**
  - `ci.yml`: least-privilege permissions, actions pinned to commit SHAs, `persist-credentials: false`, job timeouts, cancel superseded runs, and a `dependency-review` job on pull requests.
  - `codeql.yml`: CodeQL `security-extended` on pushes to `main`, pull requests and weekly.
  - `.github/dependabot.yml`: weekly grouped update PRs for npm and GitHub Actions (needed so pinned SHAs do not go stale).
  - `.github/rulesets/protect-main.json`: the ruleset applied to `main` (PR required, squash only, CI and CodeQL must pass, no force-push, no deletion, linear history, conversations resolved). Zero required approvals because the owner is the only maintainer and GitHub does not let authors approve their own PRs.
  - `SECURITY.md` written now (instead of M6) because private vulnerability reporting is enabled now and the policy must exist when it is.
- **Not done:** issue/PR templates, CODEOWNERS and a code of conduct (owner did not select them).
- 2026-10-07 follow-up: the webhook URL rule moved to `packages/db/src/webhook-url.ts` so the worker (M4) can re-check URLs before every delivery without importing from `apps/api`.
