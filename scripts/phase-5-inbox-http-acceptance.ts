import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword } from "@/lib/auth/crypto";
import { connectionWebhookToken } from "@/integrations/evolution-webhook";

const suffix = randomUUID().replaceAll("-", "");
const tenantIds: string[] = [];
const userIds: string[] = [];
const password = createOpaqueToken();
async function request(path: string, options: { cookie?: string; token?: string; body?: unknown; method?: string; tenantId?: string; contentType?: string } = {}) {
  return fetch(`${process.env.APP_URL}${path}`, { method: options.method ?? "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": options.contentType ?? "application/json", ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.token ? { "x-bm-webhook-token": options.token } : {}), ...(options.tenantId ? { "x-tenant-id": options.tenantId } : {}) }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
}
async function user(tenantId: string, role: "PLATFORM_ADMIN" | "TENANT_MASTER" | "TENANT_MANAGER" | "CONSULTANT") {
  const fixture = await db.user.create({ data: { name: "Synthetic Inbox HTTP", email: `inbox-${randomUUID()}-${suffix}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } });
  userIds.push(fixture.id);
  await db.membership.create({ data: { userId: fixture.id, tenantId, role, status: "ACTIVE" } });
  const login = await request("/api/auth/login", { method: "POST", body: { email: fixture.email, password } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie);
  return { cookie, id: fixture.id };
}
async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging");
  assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a");
  assert.equal(process.env.LIVE_HTTP_ACCEPTANCE, "true");
  try {
    const tenant = await db.tenant.create({ data: { name: "Synthetic Inbox HTTP", slug: `http-inbox-${suffix}` } }); tenantIds.push(tenant.id);
    const foreign = await db.tenant.create({ data: { name: "Foreign Inbox HTTP", slug: `http-inbox-foreign-${suffix}` } }); tenantIds.push(foreign.id);
    const binding = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `inbox_http_${suffix}` } });
    const otherBinding = await db.messagingConnection.create({ data: { tenantId: foreign.id, instanceName: `inbox_foreign_${suffix}` } });
    const [admin, master, consultant, manager, foreignMaster] = await Promise.all([user(tenant.id, "PLATFORM_ADMIN"), user(tenant.id, "TENANT_MASTER"), user(tenant.id, "CONSULTANT"), user(tenant.id, "TENANT_MANAGER"), user(foreign.id, "TENANT_MASTER")]);
    const hook = `/api/webhooks/evolution/${binding.id}`;
    const token = connectionWebhookToken(binding.id);
    const body = { event: "messages.upsert", instance: binding.instanceName, apikey: "synthetic-provider-secret", data: { key: { id: "synthetic-http-message", remoteJid: "5511999990000@s.whatsapp.net", fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Synthetic HTTP inbox text <script>unsafe()</script>" }, pushName: "Synthetic Contact" } };
    assert.equal((await request(hook, { method: "POST", body })).status, 401);
    assert.equal((await request(hook, { method: "POST", token: "a".repeat(64), body })).status, 401);
    assert.equal((await request(`/api/webhooks/evolution/${otherBinding.id}`, { method: "POST", token, body: { ...body, instance: otherBinding.instanceName } })).status, 401);
    assert.equal((await request(hook, { method: "POST", token, body: { ...body, instance: otherBinding.instanceName } })).status, 403);
    const delivered = await Promise.all([request(hook, { method: "POST", token, body }), request(hook, { method: "POST", token, body })]);
    for (const response of delivered) assert.equal(response.status, 200);
    const results = await Promise.all(delivered.map((response) => response.json()));
    assert.equal(results.reduce((sum, result) => sum + result.accepted, 0), 1);
    assert.equal(results.reduce((sum, result) => sum + result.duplicates, 0), 1);
    assert.equal(await db.conversationMessage.count({ where: { tenantId: tenant.id } }), 1);
    assert.equal((await request(hook, { method: "POST", token, body: { ...body, data: {} } })).status, 400);
    assert.equal((await request(hook, { method: "POST", token, body, contentType: "text/plain" })).status, 415);
    assert.equal((await request(hook, { method: "POST", token, body: { ...body, pad: "x".repeat(262_145) } })).status, 413);
    assert.equal((await request(hook, { method: "POST", token, body: { ...body, event: "messages.set" } })).status, 202);
    const list = await request("/api/conversations", { cookie: master.cookie });
    assert.equal(list.status, 200);
    assert(list.headers.get("cache-control")?.includes("no-store"));
    const listed = await list.json();
    assert.equal(listed.total, 1);
    const id = listed.items[0].id;
    const detail = await request(`/api/conversations/${id}`, { cookie: master.cookie });
    assert.equal(detail.status, 200);
    const messages = await detail.json();
    assert.equal(messages.items[0].text, body.data.message.conversation);
    assert.equal((await request("/api/conversations")).status, 401);
    for (const cookie of [consultant.cookie, manager.cookie]) assert.equal((await request("/api/conversations", { cookie })).status, 403);
    assert.equal((await request(`/api/conversations/${id}`, { cookie: foreignMaster.cookie })).status, 404);
    assert.equal((await request("/api/conversations", { cookie: foreignMaster.cookie, tenantId: tenant.id })).status, 403);
    assert.equal((await request(`/api/platform/conversations?tenantId=${tenant.id}`, { cookie: master.cookie })).status, 403);
    assert.equal((await request(`/api/platform/conversations?tenantId=${tenant.id}`, { cookie: admin.cookie })).status, 200);
    assert.equal((await request(`/api/platform/conversations/${id}?tenantId=${foreign.id}`, { cookie: admin.cookie })).status, 404);
    assert.equal((await request("/api/conversations?page=NaN", { cookie: master.cookie })).status, 400);
    for (const [path, cookie] of [[`/platform/conversations?tenantId=${tenant.id}`, admin.cookie], ["/app/conversations", master.cookie]]) {
      const page = await request(path, { cookie }); assert.equal(page.status, 200);
      const html = await page.text(); assert(html.includes("Conversas WhatsApp"));
      assert(!html.includes(token)); assert(!html.includes(process.env.EVOLUTION_API_KEY!));
    }
    const audit = JSON.stringify(await db.auditEvent.findMany({ where: { tenantId: tenant.id } }));
    const outbox = JSON.stringify(await db.outboxEvent.findMany({ where: { tenantId: tenant.id } }));
    for (const value of [audit, outbox]) { assert(!value.includes(body.data.message.conversation)); assert(!value.includes(token)); assert(!value.includes("synthetic-provider-secret")); }
    await db.messagingConnection.update({ where: { id: binding.id }, data: { enabled: false } });
    assert.equal((await request(hook, { method: "POST", token, body })).status, 403);
    await db.messagingConnection.update({ where: { id: binding.id }, data: { enabled: true } });
    await db.user.update({ where: { id: master.id }, data: { status: "DISABLED" } });
    assert([401, 403].includes((await request("/api/conversations", { cookie: master.cookie })).status));
    await db.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
    assert.equal((await request(hook, { method: "POST", token, body })).status, 403);
    console.log(JSON.stringify({ result: "PASS", deployedHttp: true, syntheticWebhookOnly: true, concurrentDeduplication: true, authAndTenantIsolation: true, disabledBindingAndUserRejected: true, payloadLimits: true, persistedHistory: true, noBodyOrSecretsInAuditOutbox: true, messagesSent: 0 }));
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
    await db.$disconnect();
    console.log("PASS HTTP_INBOX_FIXTURE_CLEANUP");
  }
}
void main().catch((error: unknown) => { console.error(JSON.stringify({ result: "FAIL", reason: error instanceof assert.AssertionError ? error.message : "HTTP inbox acceptance failed" })); process.exitCode = 1; });
