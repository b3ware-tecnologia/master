# Phase 4 — Messaging governance

Tenant masters can record customer consent separately for WhatsApp, email and phone, with an evidence reference and recording actor. Imported identifiers do not create consent. They can configure the tenant's enabled channels, time zone, daily contact window and minimum interval since the last actual outbound contact.

Every governance check reads a repeatable database snapshot and records the plan, policy and consent revision timestamps, decision and reason codes. Eligibility requires an approved plan, active customer, valid channel identifier, explicit opt-in, due schedule, configured/enabled channel, current contact window and elapsed cooldown. A saved eligible check is informational; a future dispatcher must re-evaluate before sending. No delivery consumer or external message send is included in this phase.

The UI provides policy configuration, per-customer preference recording and explanations of blocked plan checks. All operations are tenant scoped and server gated; consultants and managers cannot change governance.

## Validation on 2026-10-05

- Local lint/typecheck/production build passed; 38 tests passed, two local connectivity tests skipped.
- Eight migrations applied in isolated staging schema `phase4_acceptance_5a286272aeab434986181c2645d83eb8`.
- Plan `cmuvlftwn000aqqit1uyo5n3u`: default blocks verified; eligible check `cmuvlfu220012qqit9wimyx2c` persisted after explicit synthetic consent/policy/approval and due schedule.
- Consent withdrawal and recent outbound contact blocked subsequent checks. Four service-level checks had four corresponding audit events.
- Cross-tenant check/preference mutation denied; consultant policy mutation denied.
- Temporary Next server on loopback, using only the isolated schema: unauthenticated plans GET 401, master GET 200, foreign tenant header 403, consultant GET 403, authenticated plan POST 201, approval PATCH 200, governance POST 200 with blocked decision.
- Authenticated relationship planner page rendered the created HTTP plan; governance page returned 200.
- Temporary server terminated, schema removed and absence verified; no external messages sent.

These sources are prepared for review; no migration was applied to the shared staging schema or production. Fork PR workflows have no reported CI checks yet, so GitHub CI is not claimed as passed. Evolution URL/key and OpenAI key were absent in WEB-STAGING when checked; external provider and AI acceptance remain pending their configurations.
