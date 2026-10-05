# Phases 7–9 — CRM, distribution and consultant workflow

The user authorized continuing in architecture order and using fictional team members for acceptance. These phases implement persistent CRM cases, customer assignment and scoped consultant work. They do not require activating OpenAI.

## User flow

A tenant master or platform administrator selects an existing customer or explicitly creates a named customer from the conversation inbox. Linking is an explicit identity decision: the system never guesses a customer from a WhatsApp name, and cannot silently replace a link. Observed inbound/outbound timestamps update only from persisted conversation messages, including existing messages at link time; creating a case never implies contact or delivery.

An administrator opens a case from that linked conversation or from an existing customer in the CRM. An optional approved relationship plan can be attached by the API. One open case per conversation is enforced under the customer lock. Manual cases retain their own description and do not imply any credit application, approval or financial outcome.

Distribution assigns the customer's cases to an active team, with an optional active consultant belonging to that team. Managers can distribute only customers already in their teams and only to teams they belong to. Initial distribution of unassigned customers is reserved to a tenant master/platform administrator. An unassigned consultant is a team queue, not a public consultant queue.

Consultants see only assigned customers and cases. They record notes, start work, wait for a customer, schedule a future return, and close/cancel with a mandatory recorded result. The stages are `NEW → IN_PROGRESS → WAITING_CUSTOMER/COMPLETED/CANCELLED`; waiting cases may resume or close. Terminal cases cannot change. A scheduled return is a persisted date shown in the queue; it is not an automatic reminder or message. Cases display up to 50 recent notes and, when explicitly linked, up to 50 source conversation messages. Media download and outbound replies remain separate work.

CRM setup supports creating teams, adding existing tenant members and generating an invitation for a master, manager or consultant, optionally in a team. The invitee sets their own password through the existing single-use activation flow. Invitations expire after 48 hours and are not automatically emailed. Invited users cannot receive cases until activation. Synthetic demo users have no permanent credentials.

## Persistence and authorization

The additive twelfth migration adds `CRMCase`, `CRMNote` and `CustomerAssignment`, their status enum, indexes and composite tenant foreign keys. Assignment references a tenant membership rather than an unscoped global user. Services revalidate active membership/capability inside database transactions. List/detail/customer APIs use tenant, team and assignment predicates; hidden navigation is an additional UI measure.

Customer/case/note request UUIDs bind the actor and normalized input hash. Advisory transaction locks serialize duplicate requests. Reuse with different content returns a conflict. Assignment and case changes use versions, and case writes share the distribution lock and recheck scope after acquiring it. This prevents a former consultant writing after redistribution. Audit/outbox records carry IDs and action/status metadata, excluding notes, message content, customer names, invite tokens and credential hashes.

Routes live at `/api/crm/*`, with explicit-administrator counterparts at `/api/platform/crm/*?tenantId=...`. Tenant UI is `/app/crm`; administrator UI is `/platform/crm?tenantId=...`. Both are private and require authenticated active access.

## Acceptance

- Local: 66 tests passed, two infrastructure connectivity tests skipped; lint/typecheck and production build passed.
- Twelve migrations and the service acceptance passed in isolated staging PostgreSQL schema `phase79_acceptance_91f7036c697d4457924ac06a3b6d688b`; its removal was verified.
- Exercised concurrent deduplication, changed-payload rejection, observed-contact timestamps, tenant/team foreign keys, manager and consultant scope, reassignment, suspension/removal/archival, future returns, guarded stages, terminal outcomes and content-free audit/outbox.
- Setup creation/invitation, invited-member assignment rejection and concurrent team-member addition passed.

Deployment, authenticated HTTP and browser evidence will be recorded below after the release completes. Isolated database acceptance alone is not deployed end-to-end proof.

## Demonstration

`CREATE_CRM_DEMO=true pnpm bootstrap:crm-demo:staging` is guarded to the BM Crédito Railway staging project. It creates the clearly labeled company **Demonstração CRM — dados fictícios**, one test team, an administrator, a manager, two consultants and four fictional customer cases. It creates no messaging connection or permanent password. The real BM Crédito company and its WhatsApp history are not modified by this bootstrap.

`LIVE_HTTP_ACCEPTANCE=true pnpm harness:phase79:http` uses uniquely named fixtures, authenticates synthetic users through the deployed login route, exercises the HTTP flow and removes its fixture tenants, users, credentials and records. Never run it against production.
