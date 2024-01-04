# blockpace

blockpace tracks hotel room blocks for event planners: it forecasts pickup against the contracted block, evaluates attrition risk, raises alerts and sends signed webhooks.

The full spec is `HANDOFF.md`. Read the relevant sections before changing anything.

## Root scripts

| Script | Does |
|--------|------|
| `pnpm dev` | Starts the database in Docker, then api, worker and web with hot reload. |
| `pnpm build` | Builds every package and app. |
| `pnpm lint` | `biome check .` |
| `pnpm format` | `biome check --write .` |
| `pnpm typecheck` | `tsc --noEmit` in every workspace package. |
| `pnpm test` | All Vitest unit tests, with coverage. |
| `pnpm test:e2e` | API e2e tests (and Playwright smoke test). |
| `pnpm verify` | lint, typecheck, test, test:e2e, build; stops at the first failure. |
| `pnpm db:up` / `db:migrate` / `db:seed` / `db:reset` | Manage the local PostgreSQL database. |

## Key conventions

1. Strict TypeScript, ESM only. No `any`, no `@ts-ignore`, no `!` outside tests.
2. Zod schemas in `packages/core` are the source of truth for every data shape.
3. One root `biome.json` for lint and format; no ESLint or Prettier.
4. Tests sit next to the source as `*.test.ts`; API e2e tests live in `apps/api/test/*.e2e.test.ts`.
5. Nothing reads the system date directly; use the `Clock` provider.
