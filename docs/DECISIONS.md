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
- The webhook URL rule (first in `apps/api/src/webhooks/webhook-url.ts`, now `packages/db/src/webhook-url.ts`) also blocks IPv4-mapped IPv6 addresses (`::ffff:10.0.0.1`) and `0.0.0.0/8`, and refuses a host that resolves to no address. These are stricter readings of "loopback, private ... unspecified".
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

## 2026-10-07 — M3 slices 4-5
- **Snapshot replace keeps the id.** `PUT .../snapshots/:asOfDate` on an existing date updates that row's `source` and `note` (a missing `note` clears it) and replaces its nights, so the snapshot id is stable. `snapshots` has no `updated_at` column in the spec, so none is added.
- **Row lock for the 400 limit.** Every snapshot write locks the block row (`SELECT ... FOR UPDATE`) first, so two concurrent writers cannot both pass the "fewer than 400 snapshots" check. Replacing an existing date never counts against the limit.
- **CSV import rules.** Column names are matched case-insensitively and in any order; unknown or duplicate columns, a missing file, an unreadable file and an empty file are `IMPORT_INVALID` (`path` is `row 1` for header problems, `file` for a missing or unreadable file). An empty `resold` cell means 0. Future dates, unknown nights, duplicate (date, night) rows and resold above contracted rooms are reported per row as `IMPORT_INVALID` rather than as their single-snapshot codes, because the import reports every problem at once. At most 100 errors are listed. The response status is 200 (the spec gives the body, not the status).
- **Import size.** Multer rejects files over 1 MB before parsing; the global filter maps that to `413 PAYLOAD_TOO_LARGE`.
- **Webhook test delivery.** `POST /v1/webhook-endpoints/:id/test` answers 202 with the queued delivery (the spec gives only the status).
- **List endpoints.** The delivery list leaves out the stored webhook body (alerts keep their `payload`), and filtering alerts by an unknown `blockId` returns an empty page, not 404.
- **DNS in tests.** `createApp(config, { lookup })` lets tests pass a fake DNS resolver to the webhook URL rule, so no test touches the network.

## 2026-10-07 — M3 review fixes
- **Auth on every route:** the API key guard now protects every route except a closed list (`/healthz`, `/readyz`, `/docs`, `/docs-json`, `/docs/*`) compared in lower case. Express matches routes case-insensitively, so the earlier "path starts with `/v1/`" check let `/V1/...` through without a key. An e2e test covers it.
- **CSV row numbers** are physical line numbers (csv-parse `info: true`), so skipped blank lines still count.
- **500 logging** keeps the error type and stack frames but not the message: a failed Drizzle query's message includes its parameters, which come from the request body.
- **`SNAPSHOT_IN_FUTURE`** is checked after the block lookup, so an unknown block is 404 whatever the date.
- **Webhook endpoint responses include `createdAt`** (HANDOFF lists `{ id, url, active, secret }`); the web page shows when each endpoint was added. The secret is still returned only by `POST`.
- **`pino` and `pino-http`** are runtime dependencies of `apps/api` (OP7): they are peer dependencies of `nestjs-pino`, which HANDOFF names.
- **Known cost:** `GET /v1/blocks` evaluates each listed block with its own queries (about 3 per block). Fine at this project's scale; a batched loader is the fix if lists grow.
- **For M6:** rate limiting keys on the client IP. Behind a load balancer the API must trust the proxy's `X-Forwarded-For`, or every caller shares one budget.

## 2026-10-07 — M4 worker
- **Worker config:** HANDOFF.md names only `apps/api/src/config.ts` and `apps/web/src/env.ts` as `process.env` readers. The worker is a separate process with its own settings, so `apps/worker/src/config.ts` is a third reader (Zod, parsed once, exit 1 on invalid config). Nothing else in the worker reads `process.env`.
- **`attempts` counts every try:** HANDOFF.md says `attempts += 1` on failure. The worker also adds 1 on success, so `attempts` is the number of requests actually sent (a first-try success shows 1, not 0).
- **Due rows use the injected clock:** HANDOFF.md writes the poll query with SQL `now()`. The worker passes `clock.now()` instead (`next_attempt_at <= $now`, and `now + backoff` when rescheduling), so tests can walk the whole retry schedule deterministically. In production both are the current instant.
- **Delivery and result in one transaction:** the row locks taken by `FOR UPDATE SKIP LOCKED` are held while the batch is sent and its results written, which is what makes concurrent workers safe. A batch is at most 20 rows and each request times out after `WEBHOOK_TIMEOUT_MS`.
- **Redirects:** `fetch` runs with `redirect: "manual"`; a 3xx response is recorded as a failure with its status code.
- **`SINK_SECRET`** was added to `.env.example` (matching the seeded endpoint's secret) and `pnpm dev` now also starts the sink. `tools/` is type-checked by `pnpm typecheck` through `tools/tsconfig.json`.
- **M4 review follow-ups:** `pino` and `pino-http` are runtime dependencies of the worker (OP7): `nestjs-pino` needs them as peers, exactly as in the API. On a 2xx the worker also stores `last_status_code` and clears `last_error`, so the deliveries list shows the final answer of every delivery, not only failed ones; HANDOFF.md step 3 lists only `status` and `delivered_at`.
- `biome.json` now uses the `.gitignore` files (`vcs.useIgnoreFile`), so generated, git-ignored files such as Next.js's `next-env.d.ts` are never linted. Before, one `pnpm build` on Windows made the next `pnpm verify` fail.

## M5 (agent)
- **Server actions plus one route handler.** Forms (record snapshot, CSV import, new block, webhook add/delete/test) use Next.js server actions; the calculator posts to `app/api/calculate/route.ts`. Both run on the server, so the browser never sees `API_BASE_URL` or `API_KEY`.
- **Web clock.** `apps/web/src/env.ts` also reads `FIXED_TODAY`, so the dashboard's "in 14 days" and the snapshot form's default date follow the same frozen date as the API in demos and the smoke test.
- **Prefill without an extra endpoint.** The "Record snapshot" form is prefilled from the live evaluation's nights (the latest snapshot on or before today), so the block page does not depend on `GET /v1/blocks/:id/snapshots`.
- **Per-section errors.** The block and webhooks pages load each API call separately; a failing call (for example an endpoint not deployed yet) shows its problem title and detail in that section only.
- **Calculator inputs.** The calculator always shows both bases, so its terms form hides the basis selector. `cutoffDate` and `today` are left to the API defaults (first night, server clock).
- **Smoke-test database.** Playwright prepares a separate `blockpace_e2e` database on the compose PostgreSQL (dropped and re-seeded with today 2026-10-06 each run), starts the API on port 4920 and the web app on 3920, so a developer's own data and dev servers are untouched. Root `test:e2e` now runs the API e2e tests, `pnpm db:up`, then the smoke test.
- **`compose.yaml` has `name: blockpace`.** Without it, `pnpm db:up` from a git worktree or a differently named folder starts a second database on the same port and fails.
- **Badge icons** are decorative (`aria-hidden`); the text label carries the meaning, so colour and icon are never the only signal.
- **Resold inputs in "Record snapshot".** The spec says one number input per night. When the block's terms have resell credit on, the form also shows a "Resold" input per night, because resold rooms only affect the bill under resell credit and the snapshot API (`resoldRooms`) is the only way to report them. Without resell credit the form has exactly one input per night.
- **Cutoff wording.** The spec gives "in 14 days" and "3 days ago". The dashboard also says "today", "tomorrow" and "yesterday" for 0, 1 and -1 days, which reads better than "in 1 days" or "in 0 days".
- **Dashboard limit.** `/` loads the first 200 blocks (`GET /v1/blocks?limit=200`, the API's maximum page). Paging through more blocks is not in the spec's page description; a planner with more than 200 active blocks would need it later.
- **Review fixes.** Ids and dates from route params and server-action arguments are validated (UUID / real calendar date) and URL-encoded before they become part of an API path. Money uses each currency's minor unit from `Intl` (0 for JPY, 3 for KWD). The CSV check uses the API's 1 MiB limit and `serverActions.bodySizeLimit` is `1.1mb`, just above it.

## 2026-10-07 — SST config is not type-checked
- **HANDOFF.md:** run `pnpm sst install` so `sst.config.ts` passes `pnpm typecheck`; if that needs AWS credentials, exclude `sst.config.ts` and `infra/` and record it.
- **What happened:** `pnpm sst install` worked without credentials (SST 3.19.3). Type-checking still fails, but only inside SST's own shipped sources (`.sst/platform/src/components/link.ts`, `rpc/rpc.ts`): they declare `module X {}` namespaces, which TypeScript 6 and 7 reject (TS1540), and `ignoreDeprecations` does not cover it. Two attempts (TypeScript 6 from `apps/api`, and `ignoreDeprecations: "6.0"`) failed the same way.
- **Done:** the HANDOFF fallback: `sst.config.ts` and `infra/*.ts` are excluded from `pnpm typecheck` (Biome still lints them). Component and option names were checked against sst.dev docs (`Vpc`, `Cluster`, `Service` with `image.dockerfile` and `loadBalancer.rules`/`health`, `Postgres` `version: "17"`, `Nextjs`, `Secret`). Revisit when SST's sources build under TypeScript 6+.
- **Why containers:** SST bundles Lambda functions with esbuild, which does not emit the decorator metadata NestJS dependency injection needs; the API and worker run as Fargate containers built with the Nest build instead.
- `aws-sdk` (pulled in by SST) is denied in `allowBuilds`: its install script only prints a maintenance notice.

## 2026-10-07 — M6: README, quick start and done checks
- **README structure (owner request):** the owner asked for a keyword-rich, SEO-focused README. On top of the sections HANDOFF.md lists, in its order, it adds a one-paragraph summary under the pitch, a "Room block attrition in plain words" subsection after "The problem" (which itself keeps to 8 sentences), and a "What you get" list after the "How it works" paragraph. Every number in it comes from a real run of the stack.
- **Quick start has one extra step:** `clone → pnpm install → pnpm db:up && pnpm db:reset → pnpm dev`. `.env.example` keeps `RUN_MIGRATIONS=false` as HANDOFF.md requires, so a fresh database needs the reset (migrations + demo data) once before `pnpm dev` shows anything. The `db:*` scripts and `pnpm dev` build `packages/*` first, so this works on a fresh clone.
- **Definition of done item 4** (no leftover marker comments): the literal command from HANDOFF.md also matches an integrity hash inside `pnpm-lock.yaml` and files in generated or local folders (`.next`, `.sst`, `.claude`, `dist`, `coverage`). The same search is therefore run with `git grep` over tracked files, excluding `pnpm-lock.yaml`, and it returns nothing.
- **Worker health check** is `node -e "process.exit(0)"`: the worker has no port, so the check only proves the Node runtime starts; Docker restarts it if the process exits.
