# AI Relationship Platform

Foundation for a multi-tenant relationship platform.

## Status

Phase 2 — Customer domain, list import and Customer 360; release acceptance in progress.

Phases 0 and 1 and the initial Phase 2 customer import are merged into `master`. The repository default branch `main` still contains only the bootstrap README; use `master` for the application. The import mapping and resilience continuation is tracked in [PR #10](https://github.com/bmcredito/master/pull/10) and [PR #11](https://github.com/bmcredito/master/pull/11). Phase 3 adds the relationship planner on top of that continuation; see [its acceptance evidence](docs/architecture/phase-3-relationship-planner.md).

See [the continuation evidence](docs/architecture/phase-2-continuation-2026-10-05.md) for current validation and remaining release gates.

The continuation also implements [messaging governance](docs/architecture/phase-4-messaging-governance.md) and prepares the [Evolution connector](docs/integrations/evolution-api.md). These phases are under review; live provider delivery and AI integration await their configuration and acceptance.

## Stack

- Next.js / React / TypeScript
- PostgreSQL
- Prisma
- Redis / BullMQ
- GitHub Actions
- Railway

## Services

- **WEB** — HTTP application and health/readiness endpoints.
- **WORKER** — asynchronous customer imports and persisted outbox processing.
- **PostgreSQL** — system of record.
- **Redis** — queue/runtime infrastructure.

## Local setup

Requirements: Node.js, the selected package manager, PostgreSQL and Redis.

Copy `.env.example` to `.env` and provide local infrastructure values.

Typical commands:

```bash
pnpm install
pnpm prisma migrate dev
pnpm dev
pnpm worker
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm harness
```

`pnpm harness` is an infrastructure-aware release verification. It requires valid `DATABASE_URL`, `REDIS_URL` and `APP_URL`; run it in the Railway WEB service environment for production validation.

`pnpm harness:phase2:staging` runs controlled import/outbox acceptance on a temporary PostgreSQL schema with all six migrations, then removes that schema. Run it inside the Railway staging network with `RAILWAY_ENVIRONMENT_NAME=staging`. The regular staging worker cannot see its synthetic jobs. `pnpm harness:phase2` is the internal child runner and requires the isolated schema provided by the staging runner. These service-level checks do not replace authenticated HTTP acceptance or process-crash tests.

## Architecture

See `docs/architecture/overview.md` and `docs/architecture/context.md`.

## Git workflow

`master` is the stable branch. After bootstrap, feature work uses `phase/*` branches and pull requests.

## Environment

Secrets are never committed. Railway supplies production environment variables. Future integrations such as OpenAI and Evolution API remain optional until their respective phases.

Production uses Node 22 and `pnpm@11.19.0`. The WEB service owns `prisma migrate deploy`; the WORKER never runs migrations.

