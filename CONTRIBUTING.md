# Contributing to blockpace

Thanks for helping. This page covers everything you need for a first pull request.

## Set up

1. Install Node.js 24 (`.nvmrc` says `24`) and run `corepack enable`. Corepack installs the pnpm version pinned in `package.json`.
2. Install Docker. The database for local development runs in Docker, and the database tests start their own PostgreSQL container with Testcontainers, so those tests fail without Docker.
3. Run `pnpm install`, then `pnpm dev`. It copies `.env.example` to `.env` if needed, starts the database, and runs the API (port 4020), worker, web app (port 3020) and the local webhook sink (port 4999) with hot reload.

To run the whole stack in containers instead, use `docker compose up --build`.

## Before you open a pull request

Run `pnpm verify`. It runs lint, typecheck, unit tests, API end-to-end tests and the build, and stops at the first failure. `pnpm format` fixes most lint and formatting problems (Biome is the only formatter).

The conventions that matter most are in `CLAUDE.md`: strict TypeScript with no `any`, Zod schemas in `packages/core` as the source of truth, and no direct reads of the system date (use the clock provider).

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, optionally with a scope such as `feat(api):`. Keep the subject short.
- `main` is protected. Create a branch (for example `feat/short-name`), push it, and open a pull request. CI must pass before it can be merged.
- Keep a pull request to one change. Explain what changed and why in the description.

## How to add a test

- Unit tests sit next to the code they test and are named `*.test.ts` (for example `packages/core/src/risk.test.ts`). Run one package with `pnpm --filter @alihdrndm/blockpace-core test`.
- API end-to-end tests live in `apps/api/test/*.e2e.test.ts` and use a real PostgreSQL container. Copy the setup from an existing file and run them with `pnpm test:e2e`.
- Property tests use `fast-check` (see `packages/core/src/properties.test.ts`).
- Never skip a test with `.skip` or `.only`, and do not mock the database.

## Reporting a security problem

Do not open a public issue. Follow `SECURITY.md`.
