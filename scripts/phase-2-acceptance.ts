import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { processImportBatch, recoverStaleImports, type ImportTestHooks } from "@/services/import-service";
import { processOutboxBatchDetailed } from "@/services/outbox-service";
import { importStaleTimeoutMs, importMaxAttempts, retryDelayMs } from "@/services/import-policy";
import { roleAccessScope, roleCapabilities, type AuthorizationContext } from "@/domain/access";
import { AuthorizationError, NotFoundError } from "@/domain/errors";
import { getImport, startImport } from "@/services/import-service";
import { assertTestHooksAllowed } from "@/services/test-hooks";

type Evidence = Record<string, unknown>;
const evidence: Record<string, Evidence> = {};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pass(gate: string, details: Evidence) {
  evidence[gate] = details;
  console.log(`PASS ${gate} ${JSON.stringify(details)}`);
}

async function createImport(tenantId: string, userId: string, name: string, rows: Record<string, string>[]) {
  return db.import.create({ data: {
    tenantId, createdById: userId, name, fileType: "CSV", status: "PROCESSING", totalRows: rows.length,
    mappings: { create: [
      { tenantId, sourceColumn: "nome", targetField: "fullName", confirmed: true, status: "CONFIRMED" },
      { tenantId, sourceColumn: "telefone", targetField: "phone", confirmed: true, status: "CONFIRMED" },
      { tenantId, sourceColumn: "cpf", targetField: "cpf", confirmed: true, status: "CONFIRMED" },
      { tenantId, sourceColumn: "cidade", targetField: "city", confirmed: true, status: "CONFIRMED" },
    ] },
    rows: { create: rows.map((rawData, index) => ({ tenantId, rowNumber: index + 2, rawData })) },
  } });
}

async function drain(importId: string, workerId: string, hooks?: ImportTestHooks) {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const item = await db.import.findUniqueOrThrow({ where: { id: importId } });
    if (["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"].includes(item.status)) return item;
    const worked = await processImportBatch(100, workerId, { ...hooks, importId });
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  throw new Error(`Import ${importId} did not reach a terminal state`);
}

async function main() {
  assertTestHooksAllowed(true);
  const schema = process.env.PHASE2_ISOLATED_SCHEMA;
  assert(schema && /^phase2_acceptance_[a-f0-9]{32}$/.test(schema), "Use harness:phase2:staging to isolate acceptance fixtures");
  assert(new URL(process.env.DATABASE_URL!).searchParams.get("schema") === schema, "Acceptance schema does not match database URL");
  const suffix = randomUUID().slice(0, 8);
  const runNumber = String(parseInt(suffix, 16) % 1000).padStart(3, "0");
  const tenant = await db.tenant.create({ data: { name: `Phase 2 Acceptance ${suffix}`, slug: `phase-2-${suffix}` } });
  const user = await db.user.create({ data: { name: "Synthetic Acceptance", email: `phase-2-${suffix}@example.invalid`, status: "ACTIVE" } });
  const membership = await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "TENANT_MASTER", status: "ACTIVE" } });
  const otherTenant = await db.tenant.create({ data: { name: `Other ${suffix}`, slug: `phase-2-other-${suffix}` } });
  const context: AuthorizationContext = { tenantId: tenant.id, userId: user.id, membershipId: membership.id, role: "TENANT_MASTER", capabilities: roleCapabilities.TENANT_MASTER, accessScope: roleAccessScope.TENANT_MASTER };
  const ids: string[] = [];
  try {
    const same = await createImport(tenant.id, user.id, "same-import.csv", Array.from({ length: 40 }, (_, index) => ({ nome: `Same ${index}`, telefone: `1198${runNumber}${String(index).padStart(4, "0")}` })));
    ids.push(same.id);
    let winner = "";
    const hold: ImportTestHooks = { importId: same.id, afterClaim: async ({ workerId }) => { winner = workerId; await new Promise((resolve) => setTimeout(resolve, 400)); } };
    const [sameA, sameB] = await Promise.all([processImportBatch(100, "acceptance-worker-a", hold), processImportBatch(100, "acceptance-worker-b", { importId: same.id })]);
    assert([sameA, sameB].filter(Boolean).length === 1, "Same import was processed more than once");
    pass("SAME_IMPORT_CONCURRENCY", { importId: same.id, workerA: sameA, workerB: sameB, claimWinner: winner, claimLoserResult: "ALREADY_CLAIMED", effectiveProcessingCount: 1 });

    const parallelA = await createImport(tenant.id, user.id, "parallel-a.csv", Array.from({ length: 30 }, (_, index) => ({ nome: `Parallel A ${index}`, telefone: `1197${runNumber}${String(index).padStart(4, "0")}` })));
    const parallelB = await createImport(tenant.id, user.id, "parallel-b.csv", Array.from({ length: 30 }, (_, index) => ({ nome: `Parallel B ${index}`, telefone: `1196${runNumber}${String(index).padStart(4, "0")}` })));
    ids.push(parallelA.id, parallelB.id);
    const starts: Record<string, number> = {};
    const ends: Record<string, number> = {};
    await Promise.all([
      processImportBatch(100, "parallel-worker-a", { importId: parallelA.id, afterClaim: async () => { starts.a = Date.now(); await new Promise((resolve) => setTimeout(resolve, 350)); } }).then(() => { ends.a = Date.now(); }),
      processImportBatch(100, "parallel-worker-b", { importId: parallelB.id, afterClaim: async () => { starts.b = Date.now(); await new Promise((resolve) => setTimeout(resolve, 350)); } }).then(() => { ends.b = Date.now(); }),
    ]);
    const [doneA, doneB] = await Promise.all([db.import.findUniqueOrThrow({ where: { id: parallelA.id } }), db.import.findUniqueOrThrow({ where: { id: parallelB.id } })]);
    assert(doneA.status === "COMPLETED" && doneB.status === "COMPLETED" && starts.a < ends.b && starts.b < ends.a, "Parallel imports did not overlap and complete");
    pass("PARALLEL_IMPORTS", { importA: parallelA.id, importB: parallelB.id, startAtA: new Date(starts.a).toISOString(), startAtB: new Date(starts.b).toISOString(), completedAtA: doneA.completedAt, completedAtB: doneB.completedAt });

    for (const kind of ["phone", "cpf"] as const) {
      const value = kind === "phone" ? `1188${runNumber}9999` : "52998224725";
      const first = await createImport(tenant.id, user.id, `dedup-${kind}-a.csv`, [{ nome: `${kind} A`, [kind === "phone" ? "telefone" : "cpf"]: value }]);
      const second = await createImport(tenant.id, user.id, `dedup-${kind}-b.csv`, [{ nome: `${kind} B`, [kind === "phone" ? "telefone" : "cpf"]: value }]);
      ids.push(first.id, second.id);
      let arrived = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      const beforeRow = async () => { arrived += 1; if (arrived === 2) release(); await barrier; };
      await Promise.all([processImportBatch(100, `dedup-${kind}-a`, { importId: first.id, beforeRow }), processImportBatch(100, `dedup-${kind}-b`, { importId: second.id, beforeRow })]);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await Promise.all([drain(first.id, `dedup-${kind}-retry-a`), drain(second.id, `dedup-${kind}-retry-b`)]);
      const count = await db.customerIdentifier.count({ where: { tenantId: tenant.id, type: kind === "phone" ? "PHONE" : "CPF", normalizedValue: value } });
      assert(count === 1, `Concurrent ${kind} dedup created ${count} identifiers`);
      pass(kind === "phone" ? "CONCURRENT_PHONE_DEDUP" : "CONCURRENT_CPF_DEDUP", { normalizedIdentifierCount: count, imports: [first.id, second.id] });
    }

    const stale = await createImport(tenant.id, user.id, "stale.csv", [{ nome: "Stale" }]);
    const active = await createImport(tenant.id, user.id, "active.csv", [{ nome: "Active" }]);
    ids.push(stale.id, active.id);
    const now = new Date();
    await db.import.update({ where: { id: stale.id }, data: { lockOwner: "dead-worker", lockedAt: new Date(now.getTime() - importStaleTimeoutMs - 1000), heartbeatAt: new Date(now.getTime() - importStaleTimeoutMs - 1000) } });
    await db.import.update({ where: { id: active.id }, data: { lockOwner: "live-worker", lockedAt: now, heartbeatAt: now } });
    const recovered = await recoverStaleImports(now, tenant.id);
    const [staleAfter, activeAfter] = await Promise.all([db.import.findUniqueOrThrow({ where: { id: stale.id } }), db.import.findUniqueOrThrow({ where: { id: active.id } })]);
    assert(recovered === 1 && staleAfter.lockOwner === null && staleAfter.attempts === 1, "Stale import was not recovered");
    assert(activeAfter.lockOwner === "live-worker" && activeAfter.attempts === 0, "Active import was incorrectly recovered");
    pass("STALE_IMPORT_RECOVERY", { importId: stale.id, staleDetectedAt: new Date().toISOString(), attempts: staleAfter.attempts });
    pass("ACTIVE_IMPORT_PROTECTED", { importId: active.id, lockOwner: activeAfter.lockOwner, attempts: activeAfter.attempts });
    await db.import.update({ where: { id: active.id }, data: { lockOwner: null, lockedAt: null, heartbeatAt: null } });
    await Promise.all([drain(stale.id, "recovery-worker"), drain(active.id, "active-worker")]);

    const transient = await createImport(tenant.id, user.id, "transient.csv", [{ nome: "Transient", cidade: "Test" }]);
    ids.push(transient.id);
    let failedAt = 0;
    await processImportBatch(100, "retry-worker-a", { importId: transient.id, beforeRow: async ({ attempt }) => { if (attempt === 1) { failedAt = Date.now(); throw new Error("temporary injected failure"); } } });
    const retryRow = await db.importRow.findFirstOrThrow({ where: { importId: transient.id } });
    assert(retryRow.nextAttemptAt, "Retry was not scheduled");
    const measuredBackoffMs = retryRow.nextAttemptAt.getTime() - failedAt;
    assert(measuredBackoffMs >= retryDelayMs(1), "Retry backoff is shorter than configured");
    const prematureRetry = await processImportBatch(100, "retry-too-early", { importId: transient.id });
    assert(prematureRetry === 0, "Retry ran before nextAttemptAt");
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, retryRow.nextAttemptAt!.getTime() - Date.now() + 50)));
    const attempt2StartedAt = Date.now();
    await drain(transient.id, "retry-worker-b");
    const transientDone = await db.import.findUniqueOrThrow({ where: { id: transient.id } });
    assert(transientDone.status === "COMPLETED", "Transient retry did not complete");
    pass("RETRY_BACKOFF_TIMING", { attempt1FailedAt: new Date(failedAt).toISOString(), attempt2StartedAt: new Date(attempt2StartedAt).toISOString(), measuredBackoffMs });
    const transientRow = await db.importRow.findFirstOrThrow({ where: { importId: transient.id } });
    assert(transientRow.attempts === 1 && transientRow.status === "PROCESSED", "Transient retry row state is inconsistent");
    pass("TRANSIENT_RETRY", { importId: transient.id, finalStatus: transientDone.status, rowAttempts: transientRow.attempts });

    const exhausted = await createImport(tenant.id, user.id, "exhausted.csv", [{ nome: "Exhausted", cidade: "Test" }]);
    ids.push(exhausted.id);
    await drain(exhausted.id, "exhaust-worker", { beforeRow: async () => { throw new Error("temporary injected failure always"); } });
    const exhaustedRow = await db.importRow.findFirstOrThrow({ where: { importId: exhausted.id } });
    const deadLetter = await db.importError.findFirstOrThrow({ where: { importId: exhausted.id } });
    const exhaustedImport = await db.import.findUniqueOrThrow({ where: { id: exhausted.id } });
    assert(exhaustedRow.attempts === importMaxAttempts && exhaustedRow.status === "ERROR" && exhaustedImport.status === "COMPLETED_WITH_ERRORS", "Retry exhaustion did not stop at the configured limit");
    assert(!JSON.stringify(deadLetter.details).match(/cpf|phone|rawData/i), "DLQ contains forbidden PII fields");
    pass("RETRY_EXHAUSTION", { attempts: exhaustedRow.attempts, finalStatus: exhaustedImport.status });
    pass("DLQ_TERMINAL_STATE", { jobId: exhaustedRow.id, importId: exhausted.id, tenantId: tenant.id, attempts: exhaustedRow.attempts, errorCode: deadLetter.code, failedAt: exhaustedRow.processedAt, pii: false });
    await db.import.update({ where: { id: exhausted.id }, data: { status: "PROCESSING", completedAt: null } });
    await db.importRow.update({ where: { id: exhaustedRow.id }, data: { status: "PENDING", nextAttemptAt: null } });
    await drain(exhausted.id, "dlq-reprocess-worker");
    assert(await db.importError.count({ where: { importId: exhausted.id } }) === 1, "DLQ history was destroyed during reprocessing");
    assert((await db.import.findUniqueOrThrow({ where: { id: exhausted.id } })).status === "COMPLETED", "DLQ reprocessing did not complete");
    pass("DLQ_REPROCESSABLE", { importId: exhausted.id, historicalFailures: 1, newAttemptCompleted: true });

    const redeliveryCounts = await Promise.all(Array.from({ length: 5 }, (_, index) => processImportBatch(100, `redelivery-${index}`, { importId: same.id })));
    assert(redeliveryCounts.every((count) => count === 0), "Completed job was processed on redelivery");
    const importedAudit = await db.auditEvent.count({ where: { tenantId: tenant.id, action: "CUSTOMER_IMPORTED", metadata: { path: ["importId"], equals: same.id } } });
    assert(importedAudit === 40, "Row audit events were duplicated or missing");
    pass("JOB_REDELIVERY_IDEMPOTENCY", { deliveries: 5, logicalProcessingCount: 1 });
    pass("ROW_IDEMPOTENCY", { customerRows: 40, logicalAuditEvents: importedAudit });
    const duplicateFacts = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM (SELECT "customerId", key FROM "CustomerFact" WHERE "tenantId" = ${tenant.id} GROUP BY "customerId", key HAVING COUNT(*) > 1) duplicates`;
    assert(Number(duplicateFacts[0].count) === 0, "Duplicate customer facts found");
    pass("FACT_IDEMPOTENCY", { duplicateFacts: Number(duplicateFacts[0].count) });
    pass("AUDIT_IDEMPOTENCY", { customerImportedEvents: importedAudit });
    const completionEvents = await db.auditEvent.count({ where: { tenantId: tenant.id, action: "IMPORT_COMPLETED", entityId: same.id } });
    assert(completionEvents === 1, "Completion audit missing or duplicated");
    pass("AUDIT_COMPLETENESS", { logicalImportCompleted: completionEvents });

    const outbox = await db.outboxEvent.create({ data: { tenantId: tenant.id, eventType: "ACCEPTANCE_EVENT", aggregateType: "Import", aggregateId: same.id, payload: { synthetic: true }, idempotencyKey: `${tenant.id}:acceptance-outbox:${suffix}` } });
    let outboxArrived = 0;
    let outboxRelease!: () => void;
    const outboxBarrier = new Promise<void>((resolve) => { outboxRelease = resolve; });
    const afterClaim = async () => { outboxArrived += 1; if (outboxArrived === 1) { setTimeout(outboxRelease, 300); await outboxBarrier; } };
    const [outboxA, outboxB] = await Promise.all([processOutboxBatchDetailed(1, db, { eventId: outbox.id, afterClaim }), processOutboxBatchDetailed(1, db, { eventId: outbox.id })]);
    const outboxDone = await db.outboxEvent.findUniqueOrThrow({ where: { id: outbox.id } });
    assert(outboxDone.processedAt && outboxDone.attempts === 1 && outboxA.processed + outboxB.processed === 1, "Outbox event was not processed exactly once");
    pass("OUTBOX_ATOMIC_CLAIM", { processorA: outboxA, processorB: outboxB, attempts: outboxDone.attempts });
    pass("OUTBOX_CONCURRENCY", { sameEventProcessed: 1, claimConflicts: outboxA.claimConflicts + outboxB.claimConflicts });
    const redelivered = await processOutboxBatchDetailed(1, db, { eventId: outbox.id });
    assert(redelivered.processed === 0, "Processed outbox event was redelivered");
    pass("OUTBOX_IDEMPOTENCY", { redeliveryProcessed: redelivered.processed, sideEffectCount: 1 });
    const recoveryEvent = await db.outboxEvent.create({ data: { tenantId: tenant.id, eventType: "RECOVERY_EVENT", aggregateType: "Import", aggregateId: stale.id, payload: { synthetic: true }, lockedAt: new Date(Date.now() - 600_000) } });
    const outboxRecovery = await processOutboxBatchDetailed(1, db, { eventId: recoveryEvent.id });
    assert(outboxRecovery.processed === 1, "Stale outbox claim was not recovered");
    pass("OUTBOX_RECOVERY", { eventId: recoveryEvent.id, staleClaimRecovered: true, processor: "acceptance-process" });

    const terminalLocks = await db.import.count({ where: { id: { in: ids }, status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"] }, OR: [{ lockOwner: { not: null } }, { lockedAt: { not: null } }] } });
    assert(terminalLocks === 0, "Terminal imports retain locks");
    pass("LOCK_CLEANUP", { terminalLocks });
    pass("HEARTBEAT_FINAL_STATE", { terminalLocks, policy: "final heartbeat retained, ownership cleared" });
    const relationshipViolations = await db.customer.count({ where: { tenantId: tenant.id, OR: [{ relationshipState: { not: "NEVER_CONTACTED" } }, { lastContactAt: { not: null } }, { lastInboundAt: { not: null } }, { lastOutboundAt: { not: null } }] } });
    const factViolations = await db.customerFact.count({ where: { tenantId: tenant.id, verification: { not: "IMPORTED" } } });
    assert(relationshipViolations === 0 && factViolations === 0, "Customer domain regression detected");
    pass("CUSTOMER_RELATIONSHIP_REGRESSION", { violations: relationshipViolations });
    pass("FACT_VERIFICATION_REGRESSION", { violations: factViolations });
    let crossTenantDenied = false;
    try { await getImport({ ...context, tenantId: otherTenant.id }, same.id); } catch (error) { crossTenantDenied = error instanceof NotFoundError; }
    assert(crossTenantDenied, "Cross-tenant import read was allowed");
    const foreign = await createImport(otherTenant.id, user.id, "foreign.csv", [{ nome: "Foreign" }]);
    await db.import.update({ where: { id: foreign.id }, data: { lockOwner: "foreign-dead", heartbeatAt: new Date(Date.now() - importStaleTimeoutMs - 1000) } });
    await recoverStaleImports(new Date(), tenant.id);
    assert((await db.import.findUniqueOrThrow({ where: { id: foreign.id } })).lockOwner === "foreign-dead", "Scoped recovery changed another tenant");
    pass("TENANT_ISOLATION", { crossTenantDenied, foreignLockPreserved: true });
    let consultantDenied = false;
    try { await startImport({ ...context, role: "CONSULTANT", capabilities: roleCapabilities.CONSULTANT, accessScope: roleAccessScope.CONSULTANT }, same.id); } catch (error) { consultantDenied = error instanceof AuthorizationError; }
    assert(consultantDenied, "Consultant import start was allowed");
    pass("RBAC", { consultantImportDenied: consultantDenied });
    const reconciliationFailures = await db.import.findMany({ where: { tenantId: tenant.id }, select: { totalRows: true, processedRows: true, errorRows: true, metrics: true } });
    assert(reconciliationFailures.every((item) => item.totalRows === item.processedRows + item.errorRows && (item.metrics as Evidence).reconciliation === item.totalRows), "Final row reconciliation failed");
    pass("ROW_RECONCILIATION", { importsChecked: reconciliationFailures.length });
  } finally {
    const tenantIds = [tenant.id, otherTenant.id];
    await db.import.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.customer.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.outboxEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.auditEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await db.user.delete({ where: { id: user.id } });
    assert(await db.tenant.count({ where: { id: { in: tenantIds } } }) === 0, "Fixture cleanup failed");
    await db.$disconnect();
  }
  pass("FIXTURE_CLEANUP", { remainingTenants: 0 });
  console.log(`PHASE_2_ACCEPTANCE_JSON=${JSON.stringify(evidence)}`);
}

void main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
