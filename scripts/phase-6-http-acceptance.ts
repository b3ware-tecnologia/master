import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword } from "@/lib/auth/crypto";

const suffix = randomUUID().replaceAll("-", "");
const tenantIds: string[] = []; const userIds: string[] = [];
const password = createOpaqueToken();
async function request(path: string, cookie?: string, body?: unknown) {
  return fetch(`${process.env.APP_URL}${path}`, { method: body === undefined ? "GET" : "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function user(tenantId: string, role: "PLATFORM_ADMIN" | "TENANT_MASTER" | "CONSULTANT") {
  const fixture = await db.user.create({ data: { name: "Synthetic AI HTTP", email: `ai-http-${randomUUID()}-${suffix}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } });
  userIds.push(fixture.id);
  await db.membership.create({ data: { userId: fixture.id, tenantId, role, status: "ACTIVE" } });
  const login = await request("/api/auth/login", undefined, { email: fixture.email, password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0]; assert(cookie);
  return { cookie, id: fixture.id };
}
async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging");
  assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a");
  assert.equal(process.env.LIVE_HTTP_ACCEPTANCE, "true");
  assert(!process.env.OPENAI_API_KEY?.trim(), "This acceptance verifies the intentionally disabled provider");
  try {
    const tenant = await db.tenant.create({ data: { name: "Synthetic AI HTTP", slug: `ai-http-${suffix}` } }); tenantIds.push(tenant.id);
    const foreign = await db.tenant.create({ data: { name: "Foreign AI HTTP", slug: `ai-http-foreign-${suffix}` } }); tenantIds.push(foreign.id);
    const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `ai_http_${suffix}` } });
    const conversation = await db.conversation.create({ data: { tenantId: tenant.id, connectionId: connection.id, remoteJid: "synthetic@lid", lastMessageAt: new Date() } });
    await db.conversationMessage.create({ data: { tenantId: tenant.id, connectionId: connection.id, conversationId: conversation.id, providerMessageId: "ai-http-1", direction: "INBOUND", kind: "TEXT", text: "Synthetic HTTP analysis fixture", occurredAt: new Date() } });
    const [master, foreignMaster, consultant, admin] = await Promise.all([user(tenant.id, "TENANT_MASTER"), user(foreign.id, "TENANT_MASTER"), user(tenant.id, "CONSULTANT"), user(tenant.id, "PLATFORM_ADMIN")]);
    const path = `/api/conversations/${conversation.id}/analysis`;
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, consultant.cookie)).status, 403);
    assert.equal((await request(path, foreignMaster.cookie)).status, 404);
    const state = await request(path, master.cookie); assert.equal(state.status, 200); assert(state.headers.get("cache-control")?.includes("no-store"));
    const body = await state.json(); assert.equal(body.configured, false); assert.equal(body.execution, null); assert.equal(body.customerLinked, false);
    assert(!JSON.stringify(body).includes("Synthetic HTTP analysis fixture"));
    const disabled = await request(path, master.cookie, {}); assert.equal(disabled.status, 503); assert.equal((await disabled.json()).code, "NOT_CONFIGURED");
    assert.equal((await request(path, consultant.cookie, {})).status, 403);
    assert.equal((await request(`${path}/save`, master.cookie, { executionId: "non-existent" })).status, 404);
    assert.equal((await request(`${path}/save`, master.cookie, {})).status, 400);
    assert.equal((await request(`/api/platform/conversations/${conversation.id}/analysis?tenantId=${tenant.id}`, master.cookie)).status, 403);
    const platform = `/api/platform/conversations/${conversation.id}/analysis?tenantId=${tenant.id}`;
    assert.equal((await request(platform, admin.cookie)).status, 200);
    assert.equal((await request(platform, admin.cookie, {})).status, 503);
    assert.equal((await request(`/api/platform/conversations/${conversation.id}/analysis?tenantId=${foreign.id}`, admin.cookie)).status, 404);
    assert.equal(await db.aIExecution.count({ where: { tenantId: tenant.id } }), 0);
    await db.user.update({ where: { id: master.id }, data: { status: "DISABLED" } });
    assert([401, 403].includes((await request(path, master.cookie)).status));
    console.log(JSON.stringify({ result: "PASS", deployedHttp: true, providerConfigured: false, credentialMissingSafe503: true, authenticatedTenantAndPlatformRoutes: true, crossTenantRejected: true, revokedUserRejected: true, executionsCreated: 0, realProviderCalls: 0, messagesSent: 0 }));
  } finally {
    await db.$transaction(async (transaction) => {
      assert.equal(await transaction.tenant.count({ where: { id: { in: tenantIds }, slug: { endsWith: suffix } } }), tenantIds.length);
      await transaction.conversationMessage.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.messagingConnection.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.auditEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.outboxEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.session.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.membership.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      await transaction.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    });
    await db.$disconnect(); console.log("PASS HTTP_AI_FIXTURE_CLEANUP");
  }
}
void main().catch((error) => { console.error(JSON.stringify({ result: "FAIL", reason: error instanceof assert.AssertionError ? error.message : "AI HTTP acceptance failed" })); process.exitCode = 1; });
