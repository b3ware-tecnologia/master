# Phase 5 — WhatsApp conversation inbox

The BM Crédito administrator activated their account and paired `bm_credito_staging` on 2026-10-05. A direct authenticated read from Evolution returned `open`; the CRM binding is OPEN. This proves the device connection, not message delivery.

## Receiving boundary

Each enabled connection has a receiver at `/api/webhooks/evolution/{connectionId}`. A dedicated environment secret, `EVOLUTION_WEBHOOK_SECRET`, derives an HMAC-SHA256 header token for that binding. Authentication precedes body parsing. Instance name must match the durable binding, and the tenant and binding must be active. The request cannot select a tenant from its payload. Tokens are compared in constant time and never returned to the browser.

Configuration uses the pinned [2.3.7 webhook router](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/event/webhook/webhook.router.ts), [schema](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/event/webhook/webhook.schema.ts) and [controller](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/event/webhook/webhook.controller.ts). Only MESSAGES_UPSERT and CONNECTION_UPDATE are subscribed, with per-event URLs and base64 media disabled. The adapter verifies the configured URL, event set and header through readback, then discards the response. Global webhooks remain disabled. Configuring a receiver does not reconnect or send a WhatsApp message.

The CRM caps the actual streamed request at 256 KiB, 50 messages per delivery and 16,000 characters per text/caption. Malformed batches fail before persistence. Direct chats support text, extended text, bounded wrappers, media-kind placeholders, and LID phone aliases. Groups, broadcasts, history events and protocol-only messages are ignored. Provider API keys, media URLs, raw payloads and media keys are discarded.

## Durable history and access

Conversation and message writes occur in one database transaction with audit/outbox records. A connection advisory lock and unique `(connectionId, providerMessageId)` constraint deduplicate concurrent deliveries. An older message does not move the conversation's latest timestamp backwards. Stale connection callbacks cannot overwrite a newer status check. A failed database transaction returns 500 so Evolution can retry.

Conversation, connection, customer and message relations enforce composite tenant foreign keys. Customer matching uses an exact PHONE identifier in that tenant; unmatched contacts remain conversations without creating customers. No fuzzy matching or relationship-state inference is performed. Content is stored only in the conversation message, never in audit/outbox metadata.

Active platform administrators read a explicitly selected company's inbox at `/platform/conversations`; active tenant masters read their own at `/app/conversations`. API list/detail routes revalidate current memberships and tenant status. Managers and consultants are denied until their scoped distribution workflow exists. Page sizes are 25 conversations and 50 messages, with bounded page inputs and no-store responses. The UI polls every ten seconds while visible and escapes message content using React text nodes.

## Operational commands

`pnpm webhook:bm:staging` is an operator-only command guarded by the exact staging project. It configures only the existing OPEN BM Crédito binding, reads the configuration back and records an operator-origin audit. Platform administrators can also use the authenticated `/api/platform/messaging-connections/{tenantId}/webhook` POST endpoint. Secrets stay in Railway variables and the provider's server-side header configuration.

`pnpm harness:phase5inbox:staging` creates a unique PostgreSQL schema, applies ten migrations, checks persistence, deduplication and authorization, then verifies schema cleanup. `LIVE_HTTP_ACCEPTANCE=true pnpm harness:phase5inbox:http` creates short-lived fixture users and bindings to exercise the deployed HTTP routes. It posts synthetic webhook events, never sends WhatsApp messages, and removes only its own fixture IDs.

## Validation on 2026-10-05

- Local lint, typecheck and production build passed; 53 tests passed and two local connectivity tests were skipped.
- Isolated PostgreSQL acceptance passed on schema `phase5inbox_acceptance_b006524f98834a7d886c81b410cd8b8c`; schema cleanup verified.
- Concurrent re-delivery persisted one message and one audit/outbox event. Exact customer matching excluded foreign-tenant customers. A foreign-tenant customer assignment failed the database foreign key.
- Suspended membership, foreign tenant, consultant, disabled binding and suspended tenant were rejected. Older messages/callbacks preserved newer state. Message text and credentials were absent from audit/outbox records.
- Deployed HTTP acceptance and provider callback configuration are tracked after release below. A real incoming message remains a separate acceptance gate.

## Remaining boundaries

This release does not send from the CRM, download/transcribe media, import past conversations, handle edits/deletions/delivery receipts, or run conversation AI. Outbox events are ready for future consumers but the current worker performs bookkeeping only. AI, governed outbound delivery, CRM outcomes and consultant distribution remain later work.

The pinned upstream [Baileys implementation](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts) includes raw message console output. The CRM's log/audit boundary does not remove that provider behavior; address provider log redaction and retention before production messaging. Existing provider database/session storage remains managed separately from CRM conversation records.
