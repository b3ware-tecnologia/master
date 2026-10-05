# Phase 2 continuation — 2026-10-05

## Verified starting state

- Repository: https://github.com/bmcredito/master.
- Default branch `main` contains only the bootstrap README. Stable application branch: `master`.
- Phases 0/1 and the initial Phase 2 customer import (PRs #8 and #9) are merged.
- PR #10 remains open on `phase/02-import-validation-fixes`, remote HEAD `84ad55d`.
- Local continuation `92cc62f` was recovered from `C:/Dev/bmcredito-master` into `D:/crm-credito`; the old checkout was preserved.
- Railway project `ef26eb2e-9425-471c-a647-65d93c0b1b8a`, staging environment `1f5f9956-e672-4b10-9695-dcb73e41dfac`.
- Observed WEB deployment `f1f66a20-df2c-4992-a009-c791716bb03a` and WORKER deployment `b397a20e-c5c8-4d3b-beeb-3ad1fe77a7af`: `SUCCESS`.
- Deployed import-service SHA-256 matched the recovered local version before these changes: `7a061a614b9c96eaedad6775edd2f4bc1b9ba781e90e14d80f93e731679243c8`.

## Corrections

The acceptance script previously emitted several unasserted PASS claims, used a 60-second stale fixture against the default 300-second timeout, and attempted to delete tenants before restricted child records. It now asserts database state, checks cross-tenant reads and recovery and consultant authorization, uses configured retry/stale limits, cleans child records first and reports completion only after fixture cleanup.

The staging runner creates a UUID-named PostgreSQL schema, applies the existing six migrations, executes synthetic acceptance and drops only that generated schema. The existing worker continues using its own schema. Production and unknown Railway environments are rejected. No shared-schema migrations or production deployment were performed.

Import reconciliation now counts current ERROR rows instead of historical DLQ entries. Previously, a corrected row could be counted both as processed and as a historical failure and prevent completion. DLQ history is preserved. Stale recovery now requires an owned lock and also recovers old locks missing a heartbeat. Claim-hook failures enter the existing cleanup path. Outbox fault hooks share the environment guard with import hooks.

## Real staging database acceptance

Executed the working sources in `/tmp/bm-phase2-20261005` inside WEB-STAGING. This is service-function acceptance against staging PostgreSQL, not a deployment of the corrections or an authenticated browser test.

- Schema: `phase2_acceptance_c892d5332cd2457c88d48c6849f8c5da`; six migrations applied, schema removed and absence verified.
- Run: approximately 18:22:15–18:22:27 UTC (15:22:15–15:22:27 America/Sao_Paulo).
- Same import: worker A processed 40 rows; worker B processed 0; 40 logical import audits and one completion audit.
- Parallel imports: both claimed at `18:22:17.439Z`, completed at `18:22:18.763Z` / `18:22:18.732Z`.
- Concurrent phone and CPF imports: one persisted identifier for each shared value.
- Stale recovery: attempts incremented to 1; active lock retained with attempts 0.
- Retry: measured first backoff 1,001 ms; premature retry processed 0 rows; subsequent retry completed.
- Exhaustion: three failed attempts, `COMPLETED_WITH_ERRORS`, terminal DLQ without raw PII fields.
- DLQ reprocess: corrected row completed with historical failure preserved.
- Five redeliveries processed no completed rows.
- Duplicate facts: 0; outbox same-event attempts: 1, one claim conflict; redelivery processed 0; stale outbox recovered.
- Cross-tenant import read denied; scoped stale recovery preserved the foreign lock; consultant import start denied.
- Eleven primary-tenant imports reconciled their persisted total/processed/error counts and metric reconciliation.
- Fixture tenants removed; `PASS ISOLATED_SCHEMA_CLEANUP`.

## Release boundary

Local validation: lint, typecheck, 33 tests passed (two connectivity tests skipped), and production build passed. The general harness inside WEB-STAGING passed lint/typecheck, all 35 tests including database/Redis connectivity, production build, Prisma validation, worker startup, health and readiness. Public `/`, `/health` and `/ready` returned HTTP 200. The harness exposed an open Redis connection after its PASS output; its finalizer now closes Redis and Prisma so automation can terminate normally.

These checks exercise concurrent service calls with distinct worker IDs inside one process. They do not establish separate-process worker crash recovery, authenticated HTTP/UI flow, external outbox side-effect delivery, a full security audit, or production acceptance. The outbox currently marks events processed and has no external consumer whose delivery can be asserted.

The account `b3ware-tecnologia` has read-only access to the original repository. The continuation must be reviewed through a fork PR or pushed by an authorized maintainer. Phase 2 remains in acceptance. At this initial checkpoint Phase 3 was unstarted; the user subsequently authorized later phases and their implementation is tracked in the Phase 3/4 and Evolution documents. Before Phase 2 closure: review/merge the corrections, validate the exact deployed revision on WEB/WORKER, finish separate-process crash and import HTTP acceptance, pass CI, and perform the agreed production smoke.
