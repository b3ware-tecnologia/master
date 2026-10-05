# Evolution API Preparation

Phase 0 intentionally does not deploy or integrate Evolution API.

The continuation sequence places provider integration in Phase 5, after relationship planning and messaging governance. On 2026-10-05 the official [release endpoint](https://github.com/evolution-foundation/evolution-api/releases/tag/2.3.7) reported `2.3.7`; the connection adapter is pinned to that contract, rather than Docker `latest`. This is a verified source contract, not evidence of a deployed or supported provider instance in this environment.

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

WEB-STAGING had neither `EVOLUTION_API_URL` nor `EVOLUTION_API_KEY` configured when checked. Live provider status, pairing, message delivery, webhook authentication/retries and conversation persistence remain pending. No provider service was provisioned and no real message was sent. The connector's synthetic acceptance uses an explicitly labeled in-process stub and must not be reported as live Evolution acceptance.

## Preparation validation on 2026-10-05

- Local lint/typecheck/production build passed; 41 tests passed, two local connectivity tests skipped.
- Nine migrations applied on staging PostgreSQL in isolated schema `phase5_acceptance_d6a49357197f4cd6ad55632eaebd4bc2`; schema removed and absence verified.
- Two simultaneous registrations returned binding `cmuvlmqnq0009qqxcuu8pp7en`, with one registration audit.
- Tenant masters could not provision bindings; a second tenant could not reuse the instance; foreign-tenant read returned no connection; consultants could not check it; a disabled platform administrator could not register another binding.
- Explicit `ACCEPTANCE_STUB` returned OPEN and then NOT_CONFIGURED; persisted state changed from OPEN to ERROR and recorded the safe error code. This confirms persistence and authorization, not provider availability.
- Adapter unit tests verify endpoint/header/timeout/redirect options, reject cross-instance responses, hide upstream error bodies and reject insecure public URLs, URL credentials and instance-path injection.
