# Phase 6 — Conversation AI and reviewed CRM notes

## Behavior

An active tenant master or platform administrator selects a conversation and requests analysis. The internal AIGateway calls OpenAI Responses with Structured Outputs; the result contains a Portuguese summary, an intent, a suggested next action and message evidence IDs. It remains a recommendation requiring human review. No WhatsApp messages are sent and no credit approval, financial facts, relationship status or communication preferences are changed.

The user explicitly chose to implement this phase now and activate OpenAI later. Missing credentials return safe 503/NOT_CONFIGURED without creating a job. The inbox displays “IA aguardando configuração” and disables analysis. Evolution continues receiving conversations independently.

## Persistence and authorization

- ModelRegistry permits only `gpt-6-luna`, with low reasoning. PromptRegistry is code-owned and has a content-hashed version. Execution records retain the model, prompt version, source fingerprint, bounded input and validated output. The [official model](https://developers.openai.com/api/docs/models/gpt-6-luna) and [Responses structured output contract](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) were checked on 2026-10-05.
- AIExecution is a durable queue polled by the worker. An atomic claim and unique lease token prevent concurrent execution. Access is revalidated before the provider call and before result persistence; worker identity cannot switch requester role. Interrupted calls fail after two minutes and are not retried automatically, because the provider may already have billed them.
- Requests for the same source/model/prompt reuse queued, running or completed executions. Tenant request serialization enforces ten new analyses per hour. Manual retry of failures consumes that budget.
- Only the latest 50 messages enter the bounded input, at most 2,000 characters per message and 24,000 text characters total. Truncation is explicit. Media is represented by kind, never downloaded or transcribed. Structured output and evidence IDs are validated again in the application. Refusals, incomplete outputs and invalid references fail safely.
- Successful, retained analyses have AIUsage token counts. Interrupted/invalid/authorization-revoked responses can incur provider usage without a retained usage record; this table is not a billing ledger. Provider billing reconciliation remains operational work.
- Save requires explicit review, a current source fingerprint and an active customer already linked within that tenant. AIDecision and one labeled CustomerTimeline note are persisted atomically with audit/outbox metadata. Repeated or concurrent saves return the same decision. Contacts without an exact customer match keep analysis in their conversation.
- AIExecution, AIUsage and AIDecision enforce composite tenant foreign keys. Managers and consultants are denied pending the later scoped distribution phase. Audit/outbox and error codes contain IDs/status only, never prompts, responses or credentials. Conversation AI content resides in access-controlled business records, not telemetry. OpenAI requests use `store: false`; this is not a claim of zero provider retention.

## Activation after credential setup

Configure `OPENAI_API_KEY` securely in Railway WEB-STAGING. Configure WORKER-STAGING with the reference `${{WEB-STAGING.OPENAI_API_KEY}}`; both must receive the same credential. `OPENAI_MODEL=gpt-6-luna` is optional and is the only registered model. Redeploy WEB and WORKER, then request one analysis through the authenticated inbox and inspect its output, usage and review flow. Do not paste the key into chat or commit it.

The additive eleventh CRM migration creates only the AI queue, usage and review tables and related indexes/foreign keys. WEB owns migration deployment; WORKER does not run migrations.

## Verification

Local lint, typecheck and production build passed. 61 tests passed; two local connectivity tests remain skipped. Gateway tests cover unavailable credentials, strict request configuration, evidence/schema validation, refusal/incomplete output, safe errors and production prohibition of injected transports.

`pnpm harness:phase6:staging` applies all eleven migrations in a unique isolated schema, checks concurrent request/claim/save behavior, tenant foreign keys, permission revocation, stale source blocking, hourly cap and safe audit/outbox, then verifies schema cleanup. Provider responses are simulated and fixture jobs are invisible to the live worker. The final extended acceptance passed in schema `phase6_acceptance_c9f840106c6146dbb681e061c9e83cea`.

`LIVE_HTTP_ACCEPTANCE=true pnpm harness:phase6:http` checks the intentionally disabled provider through deployed authenticated APIs with disposable users/conversations, then removes only its generated fixture IDs. It must be run inside the exact staging project and refuses when a real OpenAI key is present. Live provider quality, prompt-injection evaluations with a real model and real API usage are pending activation.

## Remaining architecture

Governed outbound delivery, media interpretation, consultant distribution and production retention/redaction remain separate work. Phase 5 documents the upstream Evolution raw-message logging limitation. Production and automatic outbound are not enabled by this phase.
