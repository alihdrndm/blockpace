# Architecture

blockpace is a pnpm workspace with two shared packages and three apps. The API and the worker never talk to each other directly: they share one PostgreSQL database, and the worker finds its work there.

## Map

| Path | What it is |
|------|------------|
| `packages/core` | Pure domain logic and every Zod schema. No I/O, no database. |
| `packages/db` | Drizzle schema, SQL migrations (`drizzle/`), `recordEvaluation`, the seed, the webhook URL rule, and the `db:*` command line. |
| `apps/api` | NestJS HTTP API on port 4020. |
| `apps/worker` | NestJS standalone context (no port): daily evaluation and webhook delivery. |
| `apps/web` | Next.js app on port 3020. The only thing the browser talks to. |
| `tools/webhook-sink.ts` | A tiny receiver that checks webhook signatures, for demos. |
| `compose.yaml`, `apps/*/Dockerfile` | The full stack in containers. Each Dockerfile builds from the repo root. |

`apps` import `core` and `db` through their built `dist/` folders, so run `pnpm build:packages` after changing a package (the root `typecheck`, `test` and `test:e2e` scripts do it for you).

## Request flow

```
browser -> web (server components, server actions, route handlers)
        -> API (x-api-key checked) -> packages/core + packages/db -> PostgreSQL
worker  -> PostgreSQL -> signed POST -> customer endpoint (or the local sink)
```

1. The browser only calls the Next.js server. The server adds the `x-api-key` header and calls the API at `API_BASE_URL`, so the key and the API address never reach the browser.
2. A request to the API is logged (one line, no bodies), rate limited, checked by the API key guard, validated, and then handled by a controller and service. Any error goes through the problem filter and comes back as `application/problem+json`.
3. A snapshot write or delete, or a block change that touches the terms or the cutoff date, runs `recordEvaluation` in the same database transaction. That is the only code that creates alerts. For each new alert it also queues one `webhook_deliveries` row per active endpoint.
4. The worker polls for pending deliveries, sends them, and records the result. It never waits for the API.

## Where each rule lives

| Rule | File |
|------|------|
| Attrition formulas (minimum, shortfall, resell credit, damages, tax) | `packages/core/src/evaluate.ts`, with the per-basis arithmetic in `packages/core/src/calc.ts` |
| Integer money and rounding (basis points, round half up, minimum rounding) | `packages/core/src/money.ts` |
| Forecast (`linear-14d`) | `packages/core/src/forecast.ts` |
| Risk level (`met`, `on_track`, `at_risk`, `liable`) | `packages/core/src/risk.ts` |
| Calendar dates without time zones | `packages/core/src/plain-date.ts` |
| Data shapes (blocks, evaluations, API requests and responses) | `packages/core/src/model.ts`, `packages/core/src/api-schemas.ts` |
| `recordEvaluation` and the three alert types with their `dedupe_key` rules | `packages/db/src/record-evaluation.ts` |
| Database tables | `packages/db/src/schema.ts`; migrations in `packages/db/drizzle/` |
| Migrations at API start (`RUN_MIGRATIONS=true`) | `apps/api/src/bootstrap.ts`, using `packages/db/src/migrate.ts` |
| API key guard (`timingSafeEqual`, open paths such as `/healthz`) | `apps/api/src/auth/api-key.guard.ts` |
| Problem+json errors and the error codes | `apps/api/src/errors/problem.filter.ts`, `problem.ts`; codes listed in `docs/ERRORS.md` |
| Rate limiting | `apps/api/src/app.module.ts` (`ThrottlerModule`) |
| Configuration parsed once at boot | `apps/api/src/config.ts`, `apps/worker/src/config.ts`, `packages/db/src/env.ts`, `apps/web/src/env.ts` |
| Clock (UTC today, `FIXED_TODAY`) | `apps/api/src/clock/clock.service.ts`, `apps/worker/src/clock.service.ts` |
| Webhook URL rule (https only, no private addresses unless `ALLOW_PRIVATE_WEBHOOK_TARGETS=true`) | `packages/db/src/webhook-url.ts` (`checkWebhookUrl`). The API calls it when an endpoint is created (`apps/api/src/webhooks/webhooks.service.ts`) and the worker calls it again before every delivery. |
| Delivery loop (lock with `SKIP LOCKED`, sign, send, retry schedule) | `apps/worker/src/delivery/delivery.service.ts`; signature in `apps/worker/src/delivery/signature.ts`; format in `docs/WEBHOOKS.md` |
| Daily job (cron `5 0 * * *` UTC and once at boot) | `apps/worker/src/evaluation/daily-evaluation.service.ts` |
| Demo data | `packages/db/src/seed.ts`, run by `pnpm db:seed` |
| Web API client (server only, typed with the core schemas) | `apps/web/src/lib/api.ts`; forms post to server actions in `apps/web/src/app/actions.ts` |

## Containers

`docker compose up --build` starts `db`, then `api` (which applies the migrations), then `worker`, `web` and a one-shot `seed` after the API reports healthy. `webhook-sink` runs `tools/webhook-sink.ts` on port 4999; the seed points its webhook endpoint at it. Each image is built in two stages: the first installs and builds, and `pnpm deploy --prod` copies only the production dependencies (including `core`, and `db` with its `drizzle/` folder) into the final `node:24-slim` image, which runs as the unprivileged `node` user.
