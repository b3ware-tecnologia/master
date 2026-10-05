# Phases 7–9 — CRM, distribution and consultant workflow

The user authorized continuing in architecture order and using fictional team members for acceptance. These phases implement persistent CRM cases, customer assignment and scoped consultant work. They do not require activating OpenAI.

## User flow

A tenant master or platform administrator selects an existing customer or explicitly creates a named customer from the conversation inbox. Linking is an explicit identity decision: the system never guesses a customer from a WhatsApp name, and cannot silently replace a link. Observed inbound/outbound timestamps update only from persisted conversation messages, including existing messages at link time; creating a case never implies contact or delivery.

An administrator opens a case from that linked conversation or from an existing customer in the CRM. An optional approved relationship plan can be attached by the API. One open case per conversation is enforced under the customer lock. Manual cases retain their own description and do not imply any credit application, approval or financial outcome.

Distribution assigns the customer's cases to an active team, with an optional active consultant belonging to that team. Managers can distribute only customers already in their teams and only to teams they belong to. Initial distribution of unassigned customers is reserved to a tenant master/platform administrator. An unassigned consultant is a team queue, not a public consultant queue.

Consultants see only assigned customers and cases. They record notes, start work, wait for a customer, schedule a future return, and close/cancel with a mandatory recorded result. The stages are `NEW → IN_PROGRESS → WAITING_CUSTOMER/COMPLETED/CANCELLED`; waiting cases may resume or close. Terminal cases cannot change. A scheduled return is a persisted date shown in the queue; it is not an automatic reminder or message. Cases display up to 50 recent notes and, when explicitly linked, up to 50 source conversation messages. Media download and outbound replies remain separate work.

CRM setup supports creating teams, adding existing tenant members and generating an invitation for a new master, manager or consultant, optionally in a team. The invitee sets their own password through the single-use activation flow. Invitations expire after 48 hours and are not automatically emailed. Invited users cannot receive cases until activation. Synthetic demo users have no permanent credentials.

Invitations cannot reset credentials or grant another tenant membership to an existing active global account. Both CRM and legacy user invitation services reject that path; activation rejects existing active/suspended/disabled accounts and revalidates the invited membership and active tenant atomically. Adding an already active account to another company needs a future verified account-acceptance flow. Existing members of the selected tenant can still join its teams without any password change.

## Persistence and authorization

The additive twelfth migration adds `CRMCase`, `CRMNote` and `CustomerAssignment`, their status enum, indexes and composite tenant foreign keys. Assignment references a tenant membership rather than an unscoped global user. Services revalidate active membership/capability inside database transactions. List/detail/customer APIs use tenant, team and assignment predicates; hidden navigation is an additional UI measure.

Customer/case/note request UUIDs bind the actor and normalized input hash. Advisory transaction locks serialize duplicate requests. Reuse with different content returns a conflict. Assignment and case changes use versions, and case writes share the distribution lock and recheck scope after acquiring it. This prevents a former consultant writing after redistribution. Audit/outbox records carry IDs and action/status metadata, excluding notes, message content, customer names, invite tokens and credential hashes.

Routes live at `/api/crm/*`, with explicit-administrator counterparts at `/api/platform/crm/*?tenantId=...`. Tenant UI is `/app/crm`; administrator UI is `/platform/crm?tenantId=...`. Both are private and require authenticated active access.

## Acceptance

- Local: 66 tests passed, two infrastructure connectivity tests skipped; lint/typecheck and production build passed.
- Twelve migrations and the final service acceptance passed in isolated staging PostgreSQL schema `phase79_acceptance_a93081ec045f4306bae745c9ee8c2651`; its removal was verified. The earlier setup acceptance also passed in schema `phase79_acceptance_91f7036c697d4457924ac06a3b6d688b` and was cleaned.
- Exercised concurrent deduplication, changed-payload rejection, observed-contact timestamps, tenant/team foreign keys, manager and consultant scope, reassignment, suspension/removal/archival, future returns, guarded stages, terminal outcomes and content-free audit/outbox.
- Setup creation/invitation, invited-member assignment rejection and concurrent team-member addition passed.

## Deployed staging evidence — 2026-10-05

WEB deployment `90aa581d-8d4c-477c-ac89-47aaaa38c4a0`, source revision `694a9d2`, reached `SUCCESS`. All twelve public migrations were present; `/health` and `/ready` returned 200. Normalized SHA-256 hashes for nine CRM, scope, activation, customer UI and schema source files matched the local committed implementation. OpenAI credentials remain absent.

Authenticated deployed HTTP acceptance passed with newly created synthetic master, manager, consultants, foreign-tenant master and platform administrator sessions. It verified customer/conversation/case creation and linkage, assignments, notes/stages/returns/closure, duplicate request handling, conflicts, role and cross-tenant denial, reassignment revocation, private responses, server-rendered consultant navigation/customer scope, setup and invite activation. Reusing activation tokens, resetting an active foreign account through CRM/legacy invites or old activation tokens, and activating a suspended membership were rejected. The active account's password hash stayed unchanged. All temporary fixture data, sessions, users and tenants were deleted by the guarded cleanup. No provider call or message send occurred.

The existing human platform session opened the separate demonstration company and its four fictional cases. Browser acceptance assigned its queue customer to a consultant, returned it to the team queue, saved a clearly fictional note and verified that note after reloading the final release. The screenshot is local evidence at `.private/phase79-crm-demo.jpg`, excluded from Git. This is platform-browser proof and authenticated consultant HTTP/server-rendering proof; a human consultant login and real customer case remain separate operational acceptance.

WORKER deployment `2a576d0f-ff4f-48d2-a74c-ad01706f5c1e`, also revision `694a9d2`, reached `SUCCESS`. Its startup emitted `postgres_connected`, `redis_connected` and `worker_started`; nine normalized source hashes matched the committed implementation, and all twelve public migrations were visible. The worker performed no migration. No OpenAI key is configured on either service.

The cumulative draft remains [PR #14](https://github.com/bmcredito/master/pull/14), on fork head `phase/05-evolution-connector`, with upstream dependencies #11, #12 and #13. The upstream stable branch and production environment are separate from this manually released staging continuation. OpenAI activation, governed outbound delivery and media support remain deferred/separate work.

## Demonstration

`CREATE_CRM_DEMO=true pnpm bootstrap:crm-demo:staging` is guarded to the BM Crédito Railway staging project. It creates the clearly labeled company **Demonstração CRM — dados fictícios**, one test team, an administrator, a manager, two consultants and four fictional customer cases. It creates no messaging connection or permanent password. The real BM Crédito company and its WhatsApp history are not modified by this bootstrap.

The deployed demo tenant is `cmuvr9q670000p93yezf0kxg8`, accessible to the existing platform administrator at `/platform/crm?tenantId=cmuvr9q670000p93yezf0kxg8`.

`LIVE_HTTP_ACCEPTANCE=true pnpm harness:phase79:http` uses uniquely named fixtures, authenticates synthetic users through the deployed login route, exercises the HTTP flow and removes its fixture tenants, users, credentials and records. Never run it against production.
