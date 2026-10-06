# AI Relationship Platform

Foundation for a multi-tenant relationship platform.

## Status

Current consolidated status: [project mechanisms, validation boundaries and remaining operation requirements](docs/project-status.md). The continuation includes [governed outbound](docs/architecture/phase-10-governed-outbound.md) and [operational dashboards, tenant selection, access lifecycle, fenced import recovery and private media downloads](docs/architecture/phase-11-12-operations-media.md). OpenAI activation and real outbound sending remain deferred/disabled.

The user identified the original September execution chat as the likely product reference. [Original project reconciliation](docs/architecture/original-project-reconciliation.md) records its recovered phase specifications and concrete gaps. Phase numbers in this October continuation are not equivalent to the original roadmap. Proactive AI that initiates customer conversations remains a required, unimplemented product workflow; requested conversation analysis is auxiliary.

Staging includes customer import, relationship planning, messaging governance, Evolution provisioning/QR pairing and the conversation inbox. BM Crédito has a verified OPEN WhatsApp device connection, and the requested real incoming text test passed. Conversation AI is implemented but activation remains deferred by the user.

The deployed continuation adds [Phases 7–9: CRM, team distribution and scoped consultant workflow](docs/architecture/phase-7-9-crm-distribution.md), with private tenant and platform screens, notes, guarded stages, return dates and team invitations. Local, isolated database and authenticated deployed HTTP acceptance passed, with browser evidence from a separate fictional demonstration company. The phase document records the validation boundaries.

Phases 0 and 1 and the initial Phase 2 customer import are merged into `master`. The repository default branch `main` still contains only the bootstrap README; use `master` for the application. The import mapping and resilience continuation is tracked in [PR #10](https://github.com/bmcredito/master/pull/10) and [PR #11](https://github.com/bmcredito/master/pull/11). Phase 3 adds the relationship planner on top of that continuation; see [its acceptance evidence](docs/architecture/phase-3-relationship-planner.md).

See [the continuation evidence](docs/architecture/phase-2-continuation-2026-10-05.md) for current validation and remaining release gates.

The continuation implements [messaging governance](docs/architecture/phase-4-messaging-governance.md) and the [Evolution connector](docs/integrations/evolution-api.md). The cumulative continuation is deployed to Railway staging while the original repository PRs remain under review. Evolution provisioning and QR generation passed authenticated live staging acceptance; BM Crédito has now paired its real device. The [conversation inbox](docs/architecture/phase-5-conversations.md) adds authenticated webhooks and durable history. Real inbound text was received and persisted through the provider callback. Governed outbound is implemented with real sending disabled; the internal AI integration is implemented with activation deferred.

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
- **EVOLUTION-STAGING** — pinned Evolution 2.3.7, persistent sessions and isolated provider data.

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

## WhatsApp staging setup

BM Crédito is available in staging. A platform administrator logs in at `/login`, selects the company at `/platform`, prepares a unique instance name (for example `bm_credito_staging`) and generates the QR Code. The WhatsApp owner scans it under **Aparelhos conectados → Conectar aparelho**. Tenant masters can check/pair their own assigned instance under `/app/settings`. Provider credentials stay server-side.

The first administrator is invited through `pnpm bootstrap:bm:staging` by a trusted Railway operator after the user supplies their access email. The user sets their own password through a single-use activation link; no default password or email delivery is configured. See the [deployment evidence and operational instructions](docs/integrations/evolution-api.md).

## Conversation AI

The inbox supports requested analysis and explicitly reviewed customer timeline notes through an internal AIGateway. OpenAI activation is deferred: without a key the UI displays its configuration status and creates no jobs. See [Phase 6 behavior, acceptance and activation](docs/architecture/phase-6-conversation-ai.md).

