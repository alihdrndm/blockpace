# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-07

First release.

### Added

- Workspace with pnpm, strict TypeScript (ESM only), Biome, Vitest and CI (lint, typecheck, tests, end-to-end tests, CodeQL).
- `packages/core`: the attrition calculation (`evaluate`) with cumulative and per-night bases, resell credit, damages and tax, in integer minor units; the `linear-14d` pickup forecast; the risk level (`met`, `on_track`, `at_risk`, `liable`); the Zod schemas for every data shape. Covered by worked examples and property tests.
- `packages/db`: PostgreSQL schema and SQL migrations (Drizzle), `recordEvaluation` (the one routine that raises alerts: risk level change, cutoff approaching, stale snapshot), the shared webhook URL rule, and an idempotent seed with three demo blocks.
- `apps/api` (port 4020): blocks, snapshots (including CSV import), evaluation, pace, alerts, webhook endpoints and deliveries, and a stateless attrition calculator. Includes `x-api-key` authentication, problem+json errors, rate limiting, request logging without bodies, health and readiness checks, and Swagger docs at `/docs`.
- `apps/worker`: the daily evaluation job and the webhook delivery loop (signed `POST`s, retries with backoff, safe to run on several instances), plus `tools/webhook-sink.ts` for checking signatures locally and `docs/WEBHOOKS.md`.
- `apps/web` (port 3020): dashboard, block page with pace chart and snapshot form, new block form, calculator and webhooks page.
- Dockerfiles for the API, worker and web app, and a `compose.yaml` that starts the whole stack (database, API, worker, web, webhook sink, seed data) with `docker compose up --build`.
- Documentation: README, architecture, decisions, assumptions, error codes, webhooks, contributing and security policy.

[Unreleased]: https://github.com/alihdrndm/blockpace/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alihdrndm/blockpace/releases/tag/v0.1.0
