import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword, hashToken } from "@/lib/auth/crypto";

const suffix = randomUUID().replaceAll("-", "");
const tenantIds: string[] = []; const userIds: string[] = [];
const password = createOpaqueToken();
async function request(path: string, cookie?: string, method = "GET", body?: unknown) {
  const target = new URL(`${process.env.APP_URL}${path}`); const tenantId = target.searchParams.get("tenantId");
  return fetch(target, { method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", ...(tenantId ? { "x-tenant-id": tenantId } : {}), ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function user(tenantId: string, role: Role) {
  const fixture = await db.user.create({ data: { name: `Synthetic HTTP ${role}`, email: `crm-http-${randomUUID()}-${suffix}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } }); userIds.push(fixture.id);
  const membership = await db.membership.create({ data: { userId: fixture.id, tenantId, role, status: "ACTIVE" } });
  const login = await request("/api/auth/login", undefined, "POST", { email: fixture.email, password }); assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0]; assert(cookie);
  return { cookie, id: fixture.id, membershipId: membership.id };
}
async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging");
  assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a"); assert.equal(process.env.LIVE_HTTP_ACCEPTANCE, "true");
  try {
    const tenant = await db.tenant.create({ data: { name: "Synthetic CRM HTTP", slug: `crm-http-${suffix}` } }); tenantIds.push(tenant.id);
    const foreign = await db.tenant.create({ data: { name: "Foreign CRM HTTP", slug: `crm-http-foreign-${suffix}` } }); tenantIds.push(foreign.id);
    const [master, manager, consultant, other, foreignMaster, admin] = await Promise.all([user(tenant.id, "TENANT_MASTER"), user(tenant.id, "TENANT_MANAGER"), user(tenant.id, "CONSULTANT"), user(tenant.id, "CONSULTANT"), user(foreign.id, "TENANT_MASTER"), user(tenant.id, "PLATFORM_ADMIN")]);
    const base = "/api/crm"; const query = `?tenantId=${tenant.id}`;
    assert.equal((await request(`${base}/cases`)).status, 401);
    const customerInput = { requestKey: randomUUID(), fullName: "Synthetic HTTP customer" };
    const created = await request(`${base}/customers${query}`, master.cookie, "POST", customerInput); assert.equal(created.status, 201); const customer = await created.json();
    assert.equal((await request(`${base}/customers${query}`, master.cookie, "POST", customerInput)).status, 201);
    assert.equal((await request(`${base}/customers${query}`, consultant.cookie, "POST", customerInput)).status, 403);
    const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `crm_http_${suffix}` } });
    const conversation = await db.conversation.create({ data: { tenantId: tenant.id, connectionId: connection.id, remoteJid: "synthetic@lid", lastMessageAt: new Date() } });
    await db.conversationMessage.create({ data: { tenantId: tenant.id, connectionId: connection.id, conversationId: conversation.id, providerMessageId: "crm-http-1", direction: "INBOUND", kind: "TEXT", text: "Synthetic private HTTP message", occurredAt: new Date() } });
    assert.equal((await request(`/api/conversations/${conversation.id}/customer`, master.cookie, "PUT", { customerId: customer.id })).status, 200);
    const caseInput = { requestKey: randomUUID(), customerId: customer.id, conversationId: conversation.id, title: "Synthetic HTTP case" };
    const createdCase = await request(`${base}/cases${query}`, master.cookie, "POST", caseInput); assert.equal(createdCase.status, 201); let item = await createdCase.json();
    assert.equal((await (await request(`${base}/cases${query}`, master.cookie, "POST", caseInput)).json()).id, item.id);
    const casePath = `${base}/cases/${item.id}${query}`;
    assert.equal((await request(casePath, foreignMaster.cookie)).status, 403);
    assert.equal((await request(`${base}/cases/${item.id}`, foreignMaster.cookie)).status, 404);
    assert.equal((await request(casePath, consultant.cookie)).status, 404);
    const teamResponse = await request(`${base}/teams${query}`, master.cookie, "POST", { name: "Synthetic HTTP team" }); assert.equal(teamResponse.status, 200); const team = await teamResponse.json();
    for (const member of [manager, consultant, other]) assert.equal((await request(`${base}/team-members${query}`, master.cookie, "POST", { teamId: team.id, membershipId: member.membershipId })).status, 200);
    assert.equal((await request(`${base}/teams${query}`, manager.cookie, "POST", { name: "Forbidden HTTP team" })).status, 403);
    const inviteEmail = `crm-invite-${suffix}@example.invalid`;
    const invited = await request(`${base}/invitations${query}`, master.cookie, "POST", { name: "Synthetic HTTP invite", email: inviteEmail, role: "CONSULTANT", teamId: team.id }); assert.equal(invited.status, 200);
    const invitation = await invited.json(); const invitedUser = await db.user.findUniqueOrThrow({ where: { email: inviteEmail } }); userIds.push(invitedUser.id);
    const activationToken = new URLSearchParams(new URL(invitation.activationUrl).hash.slice(1)).get("token"); assert(activationToken);
    await db.membership.update({ where: { id: invitation.membershipId }, data: { status: "SUSPENDED" } });
    assert.equal((await request("/api/auth/activate", undefined, "POST", { token: activationToken, password })).status, 409);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: invitedUser.id } })).passwordHash, null);
    assert.equal((await db.inviteToken.findUniqueOrThrow({ where: { tokenHash: hashToken(activationToken) } })).usedAt, null);
    await db.membership.update({ where: { id: invitation.membershipId }, data: { status: "INVITED" } });
    assert.equal((await request("/api/auth/activate", undefined, "POST", { token: activationToken, password })).status, 200);
    assert.equal((await request("/api/auth/activate", undefined, "POST", { token: activationToken, password })).status, 400);
    const existingUser = await db.user.findUniqueOrThrow({ where: { id: foreignMaster.id } });
    assert.equal((await request(`${base}/invitations${query}`, master.cookie, "POST", { name: "Forbidden existing account", email: existingUser.email, role: "CONSULTANT" })).status, 409);
    assert.equal((await request("/api/users", master.cookie, "POST", { name: "Forbidden legacy invite", email: existingUser.email, role: "CONSULTANT" })).status, 409);
    const legacyToken = createOpaqueToken();
    await db.inviteToken.create({ data: { tenantId: foreign.id, userId: existingUser.id, tokenHash: hashToken(legacyToken), expiresAt: new Date(Date.now() + 3600_000) } });
    assert.equal((await request("/api/auth/activate", undefined, "POST", { token: legacyToken, password: createOpaqueToken() })).status, 400);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: existingUser.id } })).passwordHash, existingUser.passwordHash);
    assert.equal(await db.membership.count({ where: { tenantId: tenant.id, userId: existingUser.id } }), 0);
    assert.equal((await request(`${base}/setup${query}`, consultant.cookie)).status, 403);
    const setup = await request(`${base}/setup${query}`, master.cookie); assert.equal(setup.status, 200); assert(!(JSON.stringify(await setup.json()).includes("passwordHash")));
    const assignmentPath = `${base}/customers/${customer.id}/assignment${query}`;
    let assigned = await request(assignmentPath, master.cookie, "PUT", { teamId: team.id, assignedMembershipId: consultant.membershipId, expectedVersion: null }); assert.equal(assigned.status, 200); let assignment = await assigned.json();
    const detail = await request(casePath, consultant.cookie); assert.equal(detail.status, 200); assert(detail.headers.get("cache-control")?.includes("no-store")); assert.equal((await detail.json()).conversation.messages[0].text, "Synthetic private HTTP message");
    const consultantScreen = await request("/app/crm", consultant.cookie); assert.equal(consultantScreen.status, 200); const consultantHtml = await consultantScreen.text(); assert(consultantHtml.includes("Meus atendimentos")); assert(!consultantHtml.includes("Configurar equipe e acesso dos usuários"));
    const customerScreen = await request("/app/customers", consultant.cookie); assert.equal(customerScreen.status, 200); const customerHtml = await customerScreen.text(); assert(customerHtml.includes("Synthetic HTTP customer")); assert(!customerHtml.includes("Importar lista"));
    assert.equal((await request(casePath, other.cookie)).status, 404);
    assert.equal((await request(`${base}/directory${query}`, consultant.cookie)).status, 403);
    const directory = await request(`${base}/directory${query}`, manager.cookie); assert.equal(directory.status, 200); assert.equal((await directory.json())[0].id, team.id);
    const started = { action: "transition", requestKey: randomUUID(), expectedVersion: 0, status: "IN_PROGRESS", note: "Synthetic HTTP start" };
    let response = await request(casePath, consultant.cookie, "PATCH", started); assert.equal(response.status, 200); item = await response.json();
    assert.equal((await request(casePath, consultant.cookie, "PATCH", started)).status, 200);
    assert.equal((await request(casePath, consultant.cookie, "PATCH", { ...started, requestKey: randomUUID() })).status, 409);
    response = await request(casePath, consultant.cookie, "PATCH", { action: "schedule", requestKey: randomUUID(), expectedVersion: item.version, dueAt: new Date(Date.now() + 3600_000).toISOString() }); assert.equal(response.status, 200); item = await response.json(); assert(item.dueAt);
    assigned = await request(assignmentPath, manager.cookie, "PUT", { teamId: team.id, assignedMembershipId: other.membershipId, expectedVersion: assignment.version }); assert.equal(assigned.status, 200); assignment = await assigned.json(); assert.equal(assignment.version, 1);
    assert.equal((await request(casePath, consultant.cookie)).status, 404);
    assert.equal((await request(casePath, consultant.cookie, "PATCH", { action: "note", requestKey: randomUUID(), expectedVersion: item.version, note: "Forbidden after distribution" })).status, 404);
    response = await request(casePath, other.cookie, "PATCH", { action: "transition", requestKey: randomUUID(), expectedVersion: item.version, status: "COMPLETED", note: "Synthetic HTTP completed outcome" }); assert.equal(response.status, 200); item = await response.json(); assert(item.completedAt);
    assert.equal((await request(casePath, other.cookie, "PATCH", { action: "note", requestKey: randomUUID(), expectedVersion: item.version, note: "Forbidden terminal action" })).status, 409);
    assert.equal((await request(`/api/platform/crm/cases?tenantId=${tenant.id}`, master.cookie)).status, 403);
    assert.equal((await request(`/api/platform/crm/cases/${item.id}?tenantId=${tenant.id}`, admin.cookie)).status, 200);
    assert.equal((await request(`/api/platform/crm/cases/${item.id}?tenantId=${foreign.id}`, admin.cookie)).status, 404);
    await db.membership.update({ where: { id: other.membershipId }, data: { status: "SUSPENDED" } }); assert.equal((await request(casePath, other.cookie)).status, 403);
    for (const value of [JSON.stringify(await db.auditEvent.findMany({ where: { tenantId: tenant.id } })), JSON.stringify(await db.outboxEvent.findMany({ where: { tenantId: tenant.id } }))]) assert(!value.includes("Synthetic private HTTP message") && !value.includes("Synthetic HTTP completed outcome"));
    console.log(JSON.stringify({ result: "PASS", deployedHttp: true, phases: [7, 8, 9], rolesAndScope: true, reassignmentRevokesAccess: true, versionAndTerminalGuards: true, invitationSingleUse: true, existingAccountPasswordResetBlocked: true, credentialFieldsExcluded: true, realProviderCalls: 0, messagesSent: 0 }));
  } finally {
    await db.$transaction(async (transaction) => {
      assert.equal(await transaction.tenant.count({ where: { id: { in: tenantIds }, slug: { endsWith: suffix } } }), tenantIds.length);
      await transaction.cRMNote.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.cRMCase.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.customerAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.conversationMessage.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.messagingConnection.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.customerTimeline.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.customerSource.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.customer.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.inviteToken.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.auditEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.outboxEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.teamMember.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.team.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.session.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      await transaction.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    });
    await db.$disconnect(); console.log("PASS HTTP_CRM_FIXTURE_CLEANUP");
  }
}
void main().catch((error) => { console.error(JSON.stringify({ result: "FAIL", reason: error instanceof assert.AssertionError ? error.message : "CRM HTTP acceptance failed" })); process.exitCode = 1; });
