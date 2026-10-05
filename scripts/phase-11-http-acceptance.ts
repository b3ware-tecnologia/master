import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword } from "@/lib/auth/crypto";

const suffix = randomUUID().replaceAll("-", ""); const tenants: string[] = []; const users: string[] = [];
const password = createOpaqueToken();
async function request(path: string, cookie?: string, method = "GET", body?: unknown) {
  const target = new URL(`${process.env.APP_URL}${path}`); const tenantId = target.searchParams.get("tenantId");
  return fetch(target, { method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(tenantId ? { "x-tenant-id": tenantId } : {}), ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
}
function cookie(response: Response) { const values = response.headers.getSetCookie().filter((value) => value.startsWith("bm_session=") || value.startsWith("bm_tenant=")); return values.map((value) => value.split(";")[0]).join("; "); }
async function user(tenantId: string, role: Role) {
  const fixture = await db.user.create({ data: { name: `Synthetic operations HTTP ${role}`, email: `operations-http-${randomUUID()}-${suffix}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } }); users.push(fixture.id);
  const member = await db.membership.create({ data: { tenantId, userId: fixture.id, role, status: "ACTIVE" } });
  const login = await request("/api/auth/login", undefined, "POST", { email: fixture.email, password }); assert.equal(login.status, 200); const session = cookie(login); assert(session.includes("bm_session="));
  return { cookie: session, user: fixture, member };
}
async function main() {
  assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a"); assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging"); assert.equal(process.env.LIVE_HTTP_ACCEPTANCE, "true");
  try {
    const tenant = await db.tenant.create({ data: { name: "Synthetic operations HTTP", slug: `operations-http-${suffix}` } }); tenants.push(tenant.id);
    const foreign = await db.tenant.create({ data: { name: "Foreign operations HTTP", slug: `operations-http-foreign-${suffix}` } }); tenants.push(foreign.id);
    const [master, manager, consultant, outsider, foreignMaster, admin] = await Promise.all([user(tenant.id, "TENANT_MASTER"), user(tenant.id, "TENANT_MANAGER"), user(tenant.id, "CONSULTANT"), user(tenant.id, "CONSULTANT"), user(foreign.id, "TENANT_MASTER"), user(tenant.id, "PLATFORM_ADMIN")]);
    const query = `?tenantId=${tenant.id}`;
    assert.equal((await request(`/api/operations${query}`)).status, 401);
    const teamResponse = await request("/api/teams", master.cookie, "POST", { name: "Synthetic operations HTTP team" }); assert.equal(teamResponse.status, 201); const team = await teamResponse.json();
    for (const person of [manager, consultant]) assert.equal((await request(`/api/teams/${team.id}/members`, master.cookie, "POST", { userId: person.user.id })).status, 201);
    const customers = []; const cases = [];
    for (let i = 0; i < 2; i++) {
      const response = await request(`/api/crm/customers${query}`, master.cookie, "POST", { fullName: `Synthetic operations HTTP customer ${i}`, requestKey: randomUUID() }); assert.equal(response.status, 201); const customer = await response.json(); customers.push(customer);
      const created = await request(`/api/crm/cases${query}`, master.cookie, "POST", { customerId: customer.id, requestKey: randomUUID(), title: `Synthetic operations HTTP case ${i}` }); assert.equal(created.status, 201); const item = await created.json(); cases.push(item);
    }
    const assignment = await request(`/api/crm/customers/${customers[0].id}/assignment${query}`, master.cookie, "PUT", { teamId: team.id, assignedMembershipId: consultant.member.id, expectedVersion: null }); assert.equal(assignment.status, 200);
    const directory = await (await request("/api/users", manager.cookie)).json(); assert.equal(directory.length, 2); assert(!directory.some((item: { id: string }) => item.id === master.user.id || item.id === outsider.user.id));
    assert.equal((await request(`/api/users/${outsider.user.id}`, manager.cookie)).status, 404);
    const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `operations_http_${suffix}` } });
    const conversation = await db.conversation.create({ data: { tenantId: tenant.id, connectionId: connection.id, customerId: customers[0].id, remoteJid: "15555550101@s.whatsapp.net", lastMessageAt: new Date() } });
    await db.cRMCase.update({ where: { id: cases[0].id }, data: { conversationId: conversation.id } });
    const message = await db.conversationMessage.create({ data: { tenantId: tenant.id, conversationId: conversation.id, connectionId: connection.id, providerMessageId: `operations-http-${suffix}`, direction: "INBOUND", kind: "TEXT", text: "Synthetic media authorization test", occurredAt: new Date() } });
    const mediaPath = `/conversations/${conversation.id}/messages/${message.id}/media`;
    assert.equal((await request(`/api${mediaPath}${query}`)).status, 401);
    assert.equal((await request(`/api${mediaPath}${query}`, consultant.cookie)).status, 403);
    assert.equal((await request(`/api/crm${mediaPath}${query}`, outsider.cookie)).status, 404);
    assert.equal((await request(`/api/crm${mediaPath}${query}`, consultant.cookie)).status, 409);
    assert.equal((await request(`/api/platform${mediaPath}${query}`, admin.cookie)).status, 409);
    assert.equal((await request(`/api${mediaPath}`, foreignMaster.cookie)).status, 404);
    await db.cRMCase.update({ where: { id: cases[0].id }, data: { dueAt: new Date(Date.now() - 60_000) } });
    for (const [person, expected] of [[master, 2], [manager, 1], [consultant, 1], [outsider, 0]] as const) { const response = await request(`/api/operations${query}`, person.cookie); assert.equal(response.status, 200); assert(response.headers.get("cache-control")?.includes("no-store")); const value = await response.json(); assert.equal(value.counts.openCases, expected); assert(!JSON.stringify(value).includes("passwordHash")); }
    assert.equal((await request(`/api/operations${query}`, foreignMaster.cookie)).status, 403);
    assert.equal((await request(`/api/platform/operations${query}`, master.cookie)).status, 403);
    assert.equal((await request(`/api/platform/operations${query}`, admin.cookie)).status, 200);
    const filtered = await request(`/api/crm/cases${query}&status=OPEN&due=OVERDUE`, consultant.cookie); assert.equal(filtered.status, 200); assert.equal((await filtered.json()).total, 1);
    assert.equal((await (await request(`/api/crm/cases${query}&q=customer%201`, consultant.cookie)).json()).total, 0);
    assert.equal((await request(`/api/crm/cases${query}&due=INVALID`, consultant.cookie)).status, 400);
    assert.equal((await request(`/api/users/${master.user.id}`, master.cookie, "PATCH", { status: "SUSPENDED" })).status, 409);
    assert.equal((await request(`/api/users/${master.user.id}`, master.cookie, "PATCH", { role: "CONSULTANT" })).status, 409);
    assert.equal((await request(`/api/users/${consultant.user.id}`, manager.cookie, "PATCH", { status: "SUSPENDED" })).status, 403);
    assert.equal((await request(`/api/users/${consultant.user.id}`, master.cookie, "PATCH", { status: "SUSPENDED" })).status, 200);
    assert.equal((await request(`/api/operations${query}`, consultant.cookie)).status, 403);
    assert.equal((await request(`/api/users/${consultant.user.id}`, master.cookie, "PATCH", { status: "ACTIVE" })).status, 200);
    assert.equal((await request(`/api/teams/${team.id}`, master.cookie, "PATCH", { status: "ARCHIVED" })).status, 200);
    assert.equal((await (await request(`/api/operations${query}`, manager.cookie)).json()).counts.openCases, 0);
    assert.equal((await request(`/api/teams/${team.id}/members`, master.cookie, "POST", { userId: outsider.user.id })).status, 409);
    assert.equal((await request(`/api/teams/${team.id}`, master.cookie, "PATCH", { status: "ACTIVE" })).status, 200);
    const masterHtml = await (await request("/app/users", master.cookie)).text(); assert(masterHtml.includes("Convidar usuário"));
    const managerHtml = await (await request("/app/users", manager.cookie)).text(); assert(!managerHtml.includes("Convidar usuário")); assert(!managerHtml.includes("Suspender acesso"));
    assert.equal((await request("/app", consultant.cookie)).status, 200);
    const inviteEmail = `operations-invite-${suffix}@example.invalid`;
    const invitationResponse = await request("/api/users", master.cookie, "POST", { name: "Synthetic activation HTTP", email: inviteEmail, role: "CONSULTANT" }); assert.equal(invitationResponse.status, 201); const invitation = await invitationResponse.json(); const invitedUser = await db.user.findUniqueOrThrow({ where: { email: inviteEmail } }); users.push(invitedUser.id);
    const link = new URL(invitation.activationUrl); assert.equal(link.search, ""); const token = new URLSearchParams(link.hash.slice(1)).get("token"); assert(token);
    assert.equal((await request(`/api/users/${invitedUser.id}`, master.cookie, "PATCH", { status: "ACTIVE" })).status, 409);
    assert.equal((await request("/api/auth/activate", undefined, "POST", { token, password })).status, 200); assert.equal((await request("/api/auth/activate", undefined, "POST", { token, password })).status, 400);
    await db.membership.create({ data: { tenantId: foreign.id, userId: outsider.user.id, role: "CONSULTANT", status: "ACTIVE" } });
    const multiLogin = await request("/api/auth/login", undefined, "POST", { email: outsider.user.email, password }); assert.equal((await multiLogin.json()).redirectTo, "/select-company"); const multiCookie = cookie(multiLogin);
    const chooser = await request("/select-company", multiCookie); assert.equal(chooser.status, 200); assert((await chooser.text()).includes("Escolha sua empresa"));
    const choose = await request("/api/tenant/select", multiCookie, "POST", { tenantId: foreign.id }); assert.equal(choose.status, 200);
    const selectedCookie = multiCookie.split("; ").filter((value) => !value.startsWith("bm_tenant=")).concat(cookie(choose)).join("; ");
    assert.equal((await (await request("/api/me", selectedCookie)).json()).tenantId, foreign.id);
    assert.equal((await request("/api/tenant/select", multiCookie, "POST", { tenantId: `unowned-${suffix}` })).status, 403);
    assert.equal((await request(`/api/users/${outsider.user.id}`, master.cookie, "PATCH", { name: "Unauthorized shared rename" })).status, 409);
    const form = new FormData(); form.set("file", new File(["nome,telefone\nSynthetic authenticated import,11955550999\n"], "synthetic-http.csv", { type: "text/csv" }));
    assert.equal((await request("/api/imports", consultant.cookie, "POST", form)).status, 403);
    const upload = await request("/api/imports", master.cookie, "POST", form); assert.equal(upload.status, 201); const item = await upload.json();
    assert.equal((await request(`/api/imports/${item.id}`, foreignMaster.cookie)).status, 404);
    assert.equal((await request(`/api/imports/${item.id}`, master.cookie, "PATCH", { nome: "fullName", telefone: "phone" })).status, 200);
    assert.equal((await request(`/api/imports/${item.id}/start`, master.cookie, "POST")).status, 200);
    let completed = false;
    for (let attempt = 0; attempt < 15; attempt++) { const state = await db.import.findUniqueOrThrow({ where: { id: item.id } }); if (state.status === "COMPLETED") { assert.equal(state.processedRows, 1); completed = true; break; } await new Promise((resolve) => setTimeout(resolve, 1000)); }
    assert(completed, "Deployed worker did not complete authenticated import");
    const status = await request(`/api/imports/${item.id}`, master.cookie); assert.equal(status.status, 200); assert.equal((await status.json()).summary.createdCount, 1);
    assert.equal(await db.customer.count({ where: { tenantId: tenant.id, fullName: "Synthetic authenticated import" } }), 1);
    assert.equal((await request("/api/auth/logout", multiCookie, "POST")).status, 200); assert.equal((await request("/api/me", selectedCookie)).status, 401);
    await db.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } }); assert.equal((await request(`/api/platform/operations?tenantId=${foreign.id}`, admin.cookie)).status, 403);
    console.log(JSON.stringify({ result: "PASS", phases: [11, 12], deployedHttp: true, dashboardRoleAndTenantScope: true, overdueFiltersAndSearch: true, lastMasterGuard: true, membershipAndTeamRevocation: true, activationFragmentSingleUse: true, tenantChooserAndLogout: true, managerDirectoryTeamScoped: true, mediaHttpAccessGuards: true, authenticatedImportThroughDeployedWorker: true, suspendedPlatformMembershipRejected: true, actualMessagesSent: 0, openAICalls: 0 }));
  } finally {
    await db.$transaction(async (transaction) => {
      assert.equal(await transaction.tenant.count({ where: { id: { in: tenants }, slug: { endsWith: suffix } } }), tenants.length);
      await transaction.import.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.cRMNote.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.cRMCase.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.conversationMessage.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.conversation.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.messagingConnection.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.customerAssignment.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.customerTimeline.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.customerSource.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.customerIdentifier.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.customerFact.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.customer.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.teamMember.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.team.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.inviteToken.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.session.deleteMany({ where: { userId: { in: users } } });
      await transaction.outboxEvent.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.auditEvent.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.membership.deleteMany({ where: { tenantId: { in: tenants } } }); await transaction.tenant.deleteMany({ where: { id: { in: tenants } } }); await transaction.user.deleteMany({ where: { id: { in: users } } });
    }, { timeout: 20_000 }); console.log("PASS HTTP_FIXTURES_CLEANUP"); await db.$disconnect();
  }
}
void main().catch((error) => { console.error(error instanceof assert.AssertionError ? error.message : "FAIL PHASE11_HTTP_ACCEPTANCE"); process.exitCode = 1; });
