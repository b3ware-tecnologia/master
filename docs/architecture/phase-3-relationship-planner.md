# Phase 3 — Relationship planner

On 2026-10-05 the user authorized subsequent phases and selected the order already documented in the architecture: Relationship Planner → Messaging Governance → Evolution → Conversation AI → CRM → Distribution → Consultant. The continuation numbers these as phases 3 through 9.

Phase 3 implements tenant-scoped draft plans per active customer, a purpose and message, a chosen channel and a future schedule. Tenant masters can explicitly approve or cancel plans. Other roles are blocked on the server until team/customer assignment scope exists. The UI includes a customer-to-plan link, plan creation and a paginated overview with approval/cancellation actions. Approval and scheduling do not alter customer contact timestamps or imply message delivery.

Creation uses a caller request UUID scoped to the tenant. Same-key requests are serialized by a PostgreSQL transaction advisory lock, with a unique constraint as a second boundary. Reusing the key with changed content is a conflict. Approval and cancellation use conditional transitions; their audit and outbox events are transactional and idempotent.

## Validation

- Local lint/typecheck/build passed; 35 tests passed, two connectivity tests skipped.
- Seven migrations applied in isolated schema `phase3_acceptance_b94e2ef490e548d19bcedbc50a04adf0` on staging PostgreSQL.
- Two simultaneous creates returned plan `cmuvl6coq0008qq2xo8t45pdv`; one plan and one creation audit persisted.
- Changed-payload request-key reuse rejected; foreign-tenant creation, approval and listing protected; consultant approval denied.
- Concurrent approvals produced one audit and one outbox event, recording approver and approval time.
- Repeated cancellation produced one cancellation audit; reapproval rejected; customer remained `NEVER_CONTACTED` with null contact/outbound timestamps.
- Past scheduling rejected. Synthetic schema removed and absence verified.

The first real database run exposed a Prisma empty-update upsert race; the request lock fixed it, and the rerun above passed. Validation exercised service functions on the real staging database. Authenticated browser acceptance and deployment of this phase remain release gates.

## Next phases

4. Persist consent and tenant contact policy; explain eligibility using deterministic governance checks.
5. Configure a pinned Evolution provider, connection health and delivery/webhook lifecycle through a provider contract. Actual provider credentials and instance are required for external acceptance.
6. Add the internal AI gateway and persisted execution/usage, with deterministic authorization and approvals outside the model.
7. Add CRM workflows based on actual conversation and relationship events.
8. Add tenant/team-scoped distribution.
9. Add consultant workflows with assigned-customer authorization.

These are a continuation sequence, not claims that later phases are implemented or released. Phase 2 release gates remain tracked separately in its continuation document.
