import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword } from "@/lib/auth/crypto";
import { connectionWebhookToken } from "@/integrations/evolution-webhook";
const suffix = randomUUID().replaceAll("-", ""); const tenants: string[] = []; const users: string[] = [];
const password = createOpaqueToken();
async function request(path: string, cookie?: string, method = "GET", body?: unknown, extraHeaders: Record<string, string> = {}) {
  const url = new URL(`${process.env.APP_URL}${path}`); const tenantId = url.searchParams.get("tenantId");
  return fetch(url, { method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", ...(tenantId ? { "x-tenant-id": tenantId } : {}), ...(cookie ? { cookie } : {}), ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function member(tenantId: string, role: Role) {
  const user = await db.user.create({ data: { name: "Synthetic outbound HTTP", email: `${randomUUID()}-${suffix}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } }); users.push(user.id);
  const membership = await db.membership.create({ data: { tenantId, userId: user.id, role, status: "ACTIVE" } });
  const login = await request("/api/auth/login", undefined, "POST", { email: user.email, password }); assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0]; assert(cookie); return { cookie, user, membership };
}
async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging"); assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a"); assert.equal(process.env.LIVE_HTTP_ACCEPTANCE, "true");
  assert.notEqual(process.env.WHATSAPP_OUTBOUND_ENABLED, "true");
  try {
    const tenant = await db.tenant.create({ data: { name: "Synthetic outbound HTTP", slug: `outbound-http-${suffix}` } }); tenants.push(tenant.id);
    const foreign = await db.tenant.create({ data: { name: "Foreign outbound HTTP", slug: `foreign-outbound-http-${suffix}` } }); tenants.push(foreign.id);
    const [master, manager, consultant, other, admin] = await Promise.all([member(tenant.id, "TENANT_MASTER"), member(tenant.id, "TENANT_MANAGER"), member(tenant.id, "CONSULTANT"), member(foreign.id, "TENANT_MASTER"), member(tenant.id, "PLATFORM_ADMIN")]);
    const customer = await db.customer.create({ data: { tenantId: tenant.id, fullName: "Private synthetic HTTP client", displayName: "Private synthetic HTTP client" } });
    const phone = await db.customerIdentifier.create({ data: { tenantId: tenant.id, customerId: customer.id, type: "PHONE", normalizedValue: "15555550101", verification: "CONFIRMED" } });
    const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `synthetic_http_${suffix}` } }); // Database fixture only; never creates an Evolution instance.
    const base = "/api/outbound"; const query = `?tenantId=${tenant.id}`;
    assert.equal((await request(base)).status, 401);
    for (const account of [manager, consultant]) {
      assert.equal((await request(`${base}${query}`, account.cookie)).status, 403);
      assert.equal((await request(`/app/whatsapp-outbox`, account.cookie)).status, 307);
      assert.equal((await request(`${base}/policy${query}`, account.cookie, "PUT", { timeZone: "UTC", startHour: 0, endHour: 24, minIntervalMinutes: 60, enabledChannels: ["WHATSAPP"] })).status, 403);
    }
    assert.equal((await request(`${base}${query}`, other.cookie)).status, 403);
    assert.equal((await request(`/api/platform/outbound${query}`, master.cookie)).status, 403);
    const list = await request(`${base}${query}`, master.cookie); assert.equal(list.status, 200); assert(list.headers.get("cache-control")?.includes("no-store")); assert.equal((await list.json()).enabled, false);
    assert.equal((await request(`${base}/policy${query}`, master.cookie, "PUT", { timeZone: "UTC", startHour: 0, endHour: 24, minIntervalMinutes: 60, enabledChannels: ["WHATSAPP"] })).status, 200);
    assert.equal((await request(`${base}/customers/${customer.id}/consent${query}`, master.cookie, "PUT", { channel: "WHATSAPP", consent: "OPTED_IN", evidence: "Synthetic isolated HTTP authorization" })).status, 200);
    const input = { requestKey: randomUUID(), customerId: customer.id, purpose: "Synthetic HTTP review", message: "Private synthetic HTTP outbound text", channel: "WHATSAPP", scheduledAt: new Date(Date.now() + 3600_000).toISOString() };
    const created = await request(`${base}/plans${query}`, master.cookie, "POST", input); assert.equal(created.status, 201); const plan = await created.json();
    assert.equal((await (await request(`${base}/plans${query}`, master.cookie, "POST", input)).json()).id, plan.id);
    assert.equal((await request(`${base}/plans/${plan.id}${query}`, master.cookie, "PATCH", { action: "approve" })).status, 200);
    await db.relationshipPlan.update({ where: { id: plan.id }, data: { scheduledAt: new Date(Date.now() - 1000) } });
    const previewResponse = await request(`${base}/preview${query}&planId=${plan.id}`, master.cookie); assert.equal(previewResponse.status, 200); assert(previewResponse.headers.get("cache-control")?.includes("no-store"));
    const preview = await previewResponse.json(); assert.equal(preview.plan.message, input.message); assert.equal(preview.recipients[0].number, phone.normalizedValue); assert.deepEqual(preview.reasons, ["OUTBOUND_DISABLED"]);
    const send = { requestKey: randomUUID(), planId: plan.id, recipientIdentifierId: phone.id, snapshotHash: preview.snapshotHash, confirmed: true };
    assert.equal((await request(`${base}${query}`, master.cookie, "POST", send)).status, 503);
    assert.equal((await request(`${base}${query}`, master.cookie, "POST", { ...send, confirmed: false })).status, 400);
    assert.equal((await request(`${base}${query}`, master.cookie, "POST", { ...send, message: "override" })).status, 400);
    assert.equal((await request(`${base}/preview?tenantId=${foreign.id}&planId=${plan.id}`, other.cookie)).status, 404);
    assert.equal((await request(`/api/platform/outbound/preview?tenantId=${foreign.id}&planId=${plan.id}`, admin.cookie)).status, 404);
    assert.equal((await request(`/api/platform/outbound/preview${query}&planId=${plan.id}`, admin.cookie)).status, 200);
    assert.equal((await request(`/app/whatsapp-outbox`, master.cookie)).status, 200);
    assert.equal((await request(`/platform/whatsapp-outbox${query}`, admin.cookie)).status, 200);
    const callbackPath = `/api/webhooks/evolution/${connection.id}`;
    const callback = { event: "send.message", instance: connection.instanceName, data: { key: { id: `synthetic-send-${suffix}`, remoteJid: `${phone.normalizedValue}@s.whatsapp.net`, fromMe: true }, message: { conversation: input.message }, messageTimestamp: Math.floor(Date.now() / 1000) } };
    assert.equal((await request(callbackPath, undefined, "POST", callback)).status, 401);
    const callbackHeaders = { "x-bm-webhook-token": connectionWebhookToken(connection.id) };
    const observation = await request(callbackPath, undefined, "POST", callback, callbackHeaders); assert.equal(observation.status, 200); assert.equal((await observation.json()).accepted, 1);
    const repeated = await request(callbackPath, undefined, "POST", { ...callback, event: "messages.upsert" }, callbackHeaders); assert.equal(repeated.status, 200); assert.equal((await repeated.json()).duplicates, 1);
    assert.equal(await db.conversationMessage.count({ where: { tenantId: tenant.id } }), 1); assert((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).lastOutboundAt);
    await db.membership.update({ where: { id: master.membership.id }, data: { status: "SUSPENDED" } }); assert.equal((await request(`${base}${query}`, master.cookie)).status, 403);
    assert.equal(await db.outboundDispatch.count({ where: { tenantId: { in: tenants } } }), 0);
    for (const records of [await db.auditEvent.findMany({ where: { tenantId: tenant.id } }), await db.outboxEvent.findMany({ where: { tenantId: tenant.id } })]) assert(!JSON.stringify(records).includes(input.message));
    console.log(JSON.stringify({ result: "PASS", phase: 10, deployedHttp: true, rolesTenantAndRevocation: true, privateReview: true, disabledSendRejected: true, syntheticSendCallbackAndDedup: true, dispatchesCreated: 0, realProviderCalls: 0, actualMessagesSent: 0 }));
  } finally {
    await db.$transaction(async (transaction) => {
      assert.equal(await transaction.tenant.count({ where: { id: { in: tenants }, slug: { endsWith: suffix } } }), tenants.length);
      await transaction.outboundDispatch.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.conversationMessage.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.conversation.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.messagingGovernanceCheck.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.relationshipPlan.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.communicationPreference.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.messagingPolicy.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.customerIdentifier.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.customer.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.messagingConnection.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.outboxEvent.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.auditEvent.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.session.deleteMany({ where: { userId: { in: users } } });
      await transaction.membership.deleteMany({ where: { tenantId: { in: tenants } } });
      await transaction.tenant.deleteMany({ where: { id: { in: tenants } } });
      await transaction.user.deleteMany({ where: { id: { in: users } } });
    }, { timeout: 20_000 });
    console.log("PASS HTTP_FIXTURES_CLEANUP"); await db.$disconnect();
  }
}
void main().catch((error) => { console.error(error instanceof assert.AssertionError ? error.message : "FAIL PHASE10_HTTP_ACCEPTANCE"); process.exitCode = 1; });
