import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { roleCapabilities, roleAccessScope, type AuthorizationContext } from "@/domain/access";
import { operationsOverview } from "@/services/operations-service";
import { UserService } from "@/services/user-service";
import { TeamService } from "@/services/team-service";
import { createCRMCase, createCRMCustomer, assignCustomer, listCRMCases, addCRMTeamMember } from "@/services/crm-service";
import { createImport, saveImportMapping, startImport, recoverStaleImports } from "@/services/import-service";
import { importStaleTimeoutMs } from "@/services/import-policy";

const children: ChildProcess[] = [];
function child(importId: string, mode: string) { const process = fork("scripts/phase-11-import-child.ts", [importId, mode], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"] }); children.push(process); return process; }
function event(process: ChildProcess, expected: string) { return new Promise<{ worked?: number }>((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error(`Child did not report ${expected}`)); }, 30_000);
  const onMessage = (value: { event: string; worked?: number }) => { if (value.event === expected) { cleanup(); resolve(value); } };
  const onExit = () => { cleanup(); reject(new Error(`Child exited before ${expected}`)); };
  function cleanup() { clearTimeout(timer); process.off("message", onMessage); process.off("exit", onExit); }
  process.on("message", onMessage); process.on("exit", onExit);
}); }
async function member(tenantId: string, role: Role) {
  const user = await db.user.create({ data: { name: `Synthetic operations ${role}`, email: `operations-${randomUUID()}@example.invalid`, status: "ACTIVE" } });
  const membership = await db.membership.create({ data: { tenantId, userId: user.id, role, status: "ACTIVE" } });
  const context: AuthorizationContext = { tenantId, userId: user.id, membershipId: membership.id, role, accessScope: roleAccessScope[role], capabilities: roleCapabilities[role] };
  return { tenantId, context };
}
async function main() {
  const schema = process.env.ACCEPTANCE_ISOLATED_SCHEMA;
  assert(schema && /^phase11_acceptance_[a-f0-9]{32}$/.test(schema)); assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
  try {
    const suffix = randomUUID(); const tenant = await db.tenant.create({ data: { name: "Synthetic operations", slug: `operations-${suffix}` } });
    const foreign = await db.tenant.create({ data: { name: "Foreign operations", slug: `operations-foreign-${suffix}` } });
    const [master, manager, consultant, other, foreignMaster] = await Promise.all([member(tenant.id, "TENANT_MASTER"), member(tenant.id, "TENANT_MANAGER"), member(tenant.id, "CONSULTANT"), member(tenant.id, "CONSULTANT"), member(foreign.id, "TENANT_MASTER")]);
    const team = await new TeamService().create(master.context, { name: "Operations team" });
    for (const actor of [manager, consultant]) await new TeamService().addMember(master.context, team.id, actor.context.userId);
    const duplicate = await Promise.all([new TeamService().addMember(master.context, team.id, other.context.userId), new TeamService().addMember(master.context, team.id, other.context.userId)]); assert.equal(duplicate[0].id, duplicate[1].id);
    assert.equal((await new UserService().list(manager.context)).length, 3); assert.equal(await new UserService().find(manager.context, master.context.userId), null);
    const now = new Date();
    const clients = [];
    for (let i = 0; i < 5; i++) { const customer = await createCRMCustomer(master, { requestKey: randomUUID(), fullName: `Operations customer ${i}` }); clients.push(customer); const item = await createCRMCase(master, { requestKey: randomUUID(), customerId: customer.id, title: `Operations case ${i}` });
      if (i < 3) await assignCustomer(master, customer.id, { teamId: team.id, assignedMembershipId: i < 2 ? consultant.context.membershipId : null, expectedVersion: null });
      if (i === 0) await db.cRMCase.update({ where: { id: item.id }, data: { dueAt: new Date(now.getTime() - 60_000) } });
      if (i === 1) await db.cRMCase.update({ where: { id: item.id }, data: { dueAt: new Date(now.getTime() + 60_000) } });
      if (i === 3) await db.cRMCase.update({ where: { id: item.id }, data: { status: "COMPLETED", completedAt: new Date(now.getTime() - 60_000), dueAt: new Date(now.getTime() - 60_000) } });
    }
    const masterView = await operationsOverview(master, now); assert.deepEqual(masterView.counts, { activeCustomers: 5, openCases: 4, overdueCases: 1, next24Hours: 1, completedLast7Days: 1, customersWaitingDistribution: 3 });
    const managerView = await operationsOverview(manager, now); assert.equal(managerView.counts.activeCustomers, 3); assert.equal(managerView.counts.customersWaitingDistribution, 1); assert.equal(managerView.counts.completedLast7Days, 0);
    const consultantView = await operationsOverview(consultant, now); assert.equal(consultantView.counts.activeCustomers, 2); assert.equal(consultantView.counts.customersWaitingDistribution, 0); assert.equal((await operationsOverview(other, now)).counts.openCases, 0);
    assert.equal((await operationsOverview(foreignMaster, now)).counts.openCases, 0); await assert.rejects(operationsOverview({ ...foreignMaster, tenantId: tenant.id }, now));
    assert.equal((await listCRMCases(master, 1, "OPEN", { due: "OVERDUE" })).total, 1); assert.equal((await listCRMCases(master, 1, "OPEN", { due: "NEXT_24H" })).total, 1);
    assert.equal((await listCRMCases(consultant, 1, "OPEN", { q: "Operations customer 4" })).total, 0); assert.equal((await listCRMCases(master, 1, "OPEN", { q: "customer 4" })).total, 1);
    await assert.rejects(new UserService().update(master.context, master.context.userId, { role: "CONSULTANT" }), /administrador/);
    await assert.rejects(new UserService().update(master.context, master.context.userId, { status: "SUSPENDED" }), /administrador/);
    await assert.rejects(new UserService().update(master.context, consultant.context.userId, { role: "PLATFORM_ADMIN" }));
    await db.membership.create({ data: { tenantId: foreign.id, userId: consultant.context.userId, role: "CONSULTANT", status: "ACTIVE" } });
    await assert.rejects(new UserService().update(master.context, consultant.context.userId, { name: "Unauthorized global rename" }), /titular/);
    await new UserService().update(master.context, consultant.context.userId, { status: "SUSPENDED" }); await assert.rejects(operationsOverview(consultant));
    await new UserService().update(master.context, consultant.context.userId, { status: "ACTIVE" });
    const invited = await new UserService().invite(master.context, { name: "Synthetic activation", email: `invited-${suffix}@example.invalid`, role: "CONSULTANT" }); assert(invited.activationUrl.includes("/activate#token="));
    await assert.rejects(new UserService().update(master.context, invited.user.id, { status: "ACTIVE" }), /titular/);
    await new TeamService().update(master.context, team.id, { status: "ARCHIVED" }); assert.equal((await operationsOverview(manager)).counts.activeCustomers, 0);
    assert.equal((await new UserService().list(manager.context)).length, 0);
    await assert.rejects(new TeamService().addMember(master.context, team.id, consultant.context.userId), /ativa/);
    await assert.rejects(addCRMTeamMember(master, { teamId: team.id, membershipId: consultant.context.membershipId }));
    await new TeamService().update(master.context, team.id, { status: "ACTIVE" });
    const secondMaster = await member(tenant.id, "TENANT_MASTER");
    const demotions = await Promise.allSettled([new UserService().update(master.context, master.context.userId, { role: "CONSULTANT" }), new UserService().update(secondMaster.context, secondMaster.context.userId, { role: "CONSULTANT" })]);
    assert.equal(demotions.filter((item) => item.status === "fulfilled").length, 1); assert.equal(await db.membership.count({ where: { tenantId: tenant.id, role: "TENANT_MASTER", status: "ACTIVE" } }), 1);
    const activeMaster = (await db.membership.findUniqueOrThrow({ where: { id: master.context.membershipId } })).role === "TENANT_MASTER" ? master : secondMaster;
    const revoked = activeMaster === master ? secondMaster : master;
    await assert.rejects(new TeamService().create(revoked.context, { name: "Revoked context" })); await assert.rejects(new UserService().update(revoked.context, other.context.userId, { status: "SUSPENDED" }));
    async function prepared(name: string) { const item = await createImport(activeMaster.context, name, "text/csv", Buffer.from("nome,telefone\nImport synthetic A,11955550101\nImport synthetic B,11955550102\nImport synthetic C,11955550103\n")); await saveImportMapping(activeMaster.context, item.id, { nome: "fullName", telefone: "phone" }); await startImport(activeMaster.context, item.id); return item; }
    await assert.rejects(createImport(revoked.context, "denied.csv", "text/csv", Buffer.from("nome\nRevoked\n")));
    const concurrent = await prepared("concurrent.csv"); const winner = child(concurrent.id, "hold"); await event(winner, "CLAIMED");
    const loser = child(concurrent.id, "run"); assert.equal((await event(loser, "DONE")).worked, 0, "Separate process must lose the held claim"); const winnerDone = event(winner, "DONE"); winner.send("resume"); const winnerResult = await winnerDone;
    const winnerImport = await db.import.findUniqueOrThrow({ where: { id: concurrent.id }, select: { lastError: true } });
    assert.equal(winnerResult.worked, 3, `Claim winner failed: ${winnerImport.lastError}`);
    const crash = await prepared("crash.csv"); const dying = child(crash.id, "crash"); await event(dying, "ONE_ROW_COMMITTED"); const died = once(dying, "exit"); dying.kill("SIGKILL"); await died;
    assert.equal(await db.importRow.count({ where: { importId: crash.id, status: "PROCESSED" } }), 1);
    await db.import.update({ where: { id: crash.id }, data: { heartbeatAt: new Date(Date.now() - importStaleTimeoutMs - 1000) } }); assert.equal(await recoverStaleImports(new Date(), tenant.id), 1);
    const replacement = child(crash.id, "run"); assert.equal((await event(replacement, "DONE")).worked, 2); assert.equal((await db.import.findUniqueOrThrow({ where: { id: crash.id } })).status, "COMPLETED");
    const stale = await prepared("zombie.csv"); const zombie = child(stale.id, "zombie"); await event(zombie, "CLAIMED"); await db.import.update({ where: { id: stale.id }, data: { heartbeatAt: new Date(Date.now() - importStaleTimeoutMs - 1000) } }); await recoverStaleImports(new Date(), tenant.id);
    const takeover = child(stale.id, "run"); assert.equal((await event(takeover, "DONE")).worked, 3); const zombieDone = event(zombie, "DONE"); zombie.send("resume"); assert.equal((await zombieDone).worked, 0);
    assert.equal(await db.auditEvent.count({ where: { action: "IMPORT_COMPLETED", entityId: stale.id } }), 1);
    assert.equal(await db.customerIdentifier.count({ where: { tenantId: tenant.id, type: "PHONE", normalizedValue: { in: ["11955550101", "11955550102", "11955550103"] } } }), 3);
    assert.equal(await db.importRow.count({ where: { importId: { in: [concurrent.id, crash.id, stale.id] }, status: "ERROR" } }), 0);
    console.log(JSON.stringify({ result: "PASS", phase: 11, dashboardRoleScopeAndTimeBoundaries: true, searchAndReturnFiltersScoped: true, lastMasterConcurrentProtection: true, activeMembershipRevalidated: true, sharedIdentityProtected: true, invitationRequiresActivation: true, archivedTeamsProtected: true, separateProcessClaim: true, separateProcessCrashAfterCommit: true, staleProcessFenced: true, importResumeNoDuplicates: true, messagesSent: 0, openAICalls: 0 }));
  } finally { for (const child of children) if (child.exitCode === null && !child.killed) child.kill("SIGKILL"); await db.$disconnect(); }
}
void main().catch((error) => { console.error(JSON.stringify({ result: "FAIL", error: error instanceof Error ? error.message : "Operations acceptance failed" })); process.exitCode = 1; });
