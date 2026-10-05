# Evolution API

Phase 0 intentionally does not deploy or integrate Evolution API.

The continuation sequence places provider integration in Phase 5, after relationship planning and messaging governance. The connection adapter and the Railway provider deployment use version `2.3.7`, verified against the official [release endpoint](https://github.com/evolution-foundation/evolution-api/releases/tag/2.3.7). Infrastructure availability, CRM connector release and WhatsApp pairing are tracked separately below.

Topics to validate at implementation time:

- deployment architecture on Railway;
- PostgreSQL and Redis requirements;
- webhook delivery and retry behavior;
- health endpoint;
- API authentication;
- secrets management;
- upgrade/rollback strategy.

The application domain will depend on `MessagingProvider`, not directly on Evolution API.

## Connector preparation

The platform administrator registers an existing instance against one tenant. Instance names are globally unique in the CRM; tenant users cannot provision or reassign provider instances. Tenant masters can view their own binding and request a read-only connection-state check. Provider URL and key remain server environment variables; they are never persisted in the binding or returned to the UI.

`EvolutionProvider` implements `MessagingProvider` and reads `GET /instance/connectionState/{instanceName}` with the `apikey` header, no redirects, no response cache and a ten-second timeout. The response must name the requested instance. Its shape and path were verified from the pinned [router](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/routes/instance.router.ts) and [controller](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/controllers/instance.controller.ts). Public URLs require HTTPS; HTTP is allowed only for Railway internal service domains. Failures persist a safe code, not provider response bodies or credentials.

At the initial preparation check, WEB-STAGING had neither `EVOLUTION_API_URL` nor `EVOLUTION_API_KEY`. Both variables have since been configured on WEB-STAGING and WORKER-STAGING as Railway references. Pairing, message delivery, webhook authentication/retries and conversation persistence remain pending. No real message was sent. The connector's synthetic acceptance uses an explicitly labeled in-process stub and must not be reported as live WhatsApp acceptance. Provisioning the provider does not deploy the Phase 3–5 CRM code or its binding migration.

## Railway staging deployment on 2026-10-05

- Project: `BM Credito` (`ef26eb2e-9425-471c-a647-65d93c0b1b8a`).
- Environment: `staging` (`1f5f9956-e672-4b10-9695-dcb73e41dfac`).
- Service: `EVOLUTION-STAGING` (`4056d09e-4342-449d-a204-eb0f750493c7`).
- Successful provider deployment: `32e43037-120f-4d02-bd1d-94ca0e430257`.
- HTTPS endpoint: <https://evolution-staging-staging-22f4.up.railway.app>.
- Source: `evoapicloud/evolution-api:v2.3.7@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339`; automatic image updates disabled.
- Health check: `/`, port `8080`, timeout `180` seconds; one replica, application sleeping disabled.
- Sessions volume: `32d8e9f6-56cb-429e-b2ee-6b41011d9616`, mounted at `/evolution/instances`; read/write check passed and the temporary probe file was removed.
- PostgreSQL: existing `Postgres-ELBg`, dedicated schema `evolution_api`; 57 provider migrations applied and 37 provider tables found. CRM tables remain in `public` (27 tables at verification). Schema separation is not a separate database credential or permission boundary.
- Redis: existing `REDIS-STAGING`, private network, logical database `6`, prefix `bm_evolution_staging`; authenticated Redis is not enabled on the existing server, so the provider's private Redis URL has no password. Read-only `PING` returned `PONG`. Redis is a cache; provider persistence uses PostgreSQL and the sessions volume.
- Random 256-bit `AUTHENTICATION_API_KEY` stored as a sealed Railway variable. `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false`; credentials are never checked into Git or printed by the probe.
- Telemetry, global webhooks, optional queues and AI/chatbot integrations disabled. Configure tenant-scoped webhooks only when the receiving CRM handler exists and is released.
- CORS: `CORS_ORIGIN=*`, `CORS_CREDENTIALS=false`. Upstream 2.3.7 rejects requests without an `Origin` header when using an explicit origin list, including Railway health checks and server-to-server calls. API operations remain guarded by `apikey`; cookie credentials are disabled. The initial deployment was replaced after this correction.

Both CRM services reference these values, with no copied literal key:

```text
EVOLUTION_API_URL=http://${{EVOLUTION-STAGING.RAILWAY_PRIVATE_DOMAIN}}:8080
EVOLUTION_API_KEY=${{EVOLUTION-STAGING.AUTHENTICATION_API_KEY}}
```

Provider database/cache references:

```text
DATABASE_CONNECTION_URI=${{Postgres-ELBg.DATABASE_URL}}?schema=evolution_api
CACHE_REDIS_URI=redis://${{REDIS-STAGING.RAILWAY_PRIVATE_DOMAIN}}:6379/6
CACHE_REDIS_PREFIX_KEY=bm_evolution_staging
```

### Live verification

`node scripts/evolution-healthcheck.mjs` (or `pnpm harness:evolution`) performs read-only version, authentication and instance-list checks. Run it inside a Railway service with the configured environment. It accepts `EVOLUTION_API_URL`/`EVOLUTION_API_KEY`, or provider-side `SERVER_URL`/`AUTHENTICATION_API_KEY`. It prints only status, version, network kind and instance count; it never creates instances, pairs a device or sends messages.

- Public HTTPS: HTTP `200`, version `2.3.7`.
- Correct API key: `GET /instance/fetchInstances` HTTP `200`, zero instances.
- Missing and incorrect key: HTTP `401` in both cases.
- PostgreSQL, Redis and mounted-volume checks passed inside the provider container.
- WEB-STAGING redeployment `29f94b04-c7ae-4a32-b329-cca52f0988e2` and WORKER-STAGING redeployment `1856f073-6726-4af6-955f-e71786af6d0a` reached Railway `SUCCESS`. Both passed the same read-only probe using `evolution-staging.railway.internal:8080`, proving the secret reference resolves at runtime.
- CRM public `/health` and `/ready` returned HTTP `200`; readiness reported database and Redis `ok` after the web redeployment.

### Pairing and upgrades

No WhatsApp instance is paired yet. Release the CRM connector and its binding migration, then register the provider instance for the correct tenant through a platform administrator. Pairing requires the owner to scan a QR code on their WhatsApp device. Prove OPEN state and an authorized message/webhook flow before reporting end-to-end messaging as ready.

For an upgrade, review the provider release and migration compatibility, back up the database and session volume, test on staging, update the pinned image digest and the adapter contract together, then rerun the live probe. Retain the previous image digest; reverting the image alone does not undo provider database migrations. Do not remove the volume when redeploying.

## Preparation validation on 2026-10-05

- Local lint/typecheck/production build passed; 41 tests passed, two local connectivity tests skipped.
- Nine migrations applied on staging PostgreSQL in isolated schema `phase5_acceptance_d6a49357197f4cd6ad55632eaebd4bc2`; schema removed and absence verified.
- Two simultaneous registrations returned binding `cmuvlmqnq0009qqxcuu8pp7en`, with one registration audit.
- Tenant masters could not provision bindings; a second tenant could not reuse the instance; foreign-tenant read returned no connection; consultants could not check it; a disabled platform administrator could not register another binding.
- Explicit `ACCEPTANCE_STUB` returned OPEN and then NOT_CONFIGURED; persisted state changed from OPEN to ERROR and recorded the safe error code. This confirms persistence and authorization, not provider availability.
- Adapter unit tests verify endpoint/header/timeout/redirect options, reject cross-instance responses, hide upstream error bodies and reject insecure public URLs, URL credentials and instance-path injection.
