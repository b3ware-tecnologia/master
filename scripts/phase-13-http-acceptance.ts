import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword } from "@/lib/auth/crypto";
import { connectionWebhookToken } from "@/integrations/evolution-webhook";
const suffix = randomUUID().replaceAll("-", ""); const tenants: string[] = []; const users: string[] = []; const password = createOpaqueToken();
async function request(path: string, cookie?: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) { const target = new URL(process.env.APP_URL + path); const tenantId = target.searchParams.get("tenantId"); return fetch(target, { method, redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", ...(tenantId ? { "x-tenant-id": tenantId } : {}), ...(cookie ? { cookie } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function member(tenantId: string, role: Role) { const user = await db.user.create({ data: { name: "Synthetic proactive HTTP", email: `${randomUUID()}-${suffix}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } }); users.push(user.id); const membership = await db.membership.create({ data: { tenantId, userId: user.id, role, status: "ACTIVE" } }); const response = await request("/api/auth/login", undefined, "POST", { email: user.email, password }); assert.equal(response.status, 200); const cookie = response.headers.getSetCookie().map((item) => item.split(";")[0]).join("; "); assert(cookie.includes("bm_session=")); return { cookie, membership, user }; }
async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging"); assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a"); assert.equal(process.env.LIVE_HTTP_ACCEPTANCE, "true"); assert.notEqual(process.env.AI_OUTREACH_ENABLED, "true"); assert.notEqual(process.env.WHATSAPP_OUTBOUND_ENABLED, "true"); assert(!process.env.OPENAI_API_KEY);
  try {
    const tenant = await db.tenant.create({ data: { name: "Synthetic proactive HTTP", slug: `proactive-http-${suffix}` } }); tenants.push(tenant.id); const foreign = await db.tenant.create({ data: { name: "Foreign proactive HTTP", slug: `foreign-proactive-http-${suffix}` } }); tenants.push(foreign.id);
    const [master, consultant, outsider, admin] = await Promise.all([member(tenant.id, "TENANT_MASTER"), member(tenant.id, "CONSULTANT"), member(foreign.id, "TENANT_MASTER"), member(tenant.id, "PLATFORM_ADMIN")]);
    const query = `?tenantId=${tenant.id}`;
    const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `synthetic_proactive_http_${suffix}`, isDefault: true, nextHealthAt: new Date(Date.now() + 86400_000) } });
    const list = await db.customerList.create({ data: { tenantId: tenant.id, name: "Synthetic audience HTTP" } });
    const customer = await db.customer.create({ data: { tenantId: tenant.id, fullName: "Synthetic proactive client", displayName: "Synthetic proactive client" } }); await db.customerIdentifier.create({ data: { tenantId: tenant.id, customerId: customer.id, type: "PHONE", normalizedValue: "15555558888", verification: "CONFIRMED" } });
    await db.customerListMember.create({ data: { tenantId: tenant.id, customerId: customer.id, listId: list.id } });
    assert.equal((await request(`/api/outreach${query}`)).status, 401); assert.equal((await request(`/api/outreach${query}`, consultant.cookie)).status, 403); assert.equal((await request(`/api/outreach${query}`, outsider.cookie)).status, 403); assert.equal((await request(`/api/platform/outreach${query}`, master.cookie)).status, 403);
    const input = { requestKey: randomUUID(), name: "Synthetic campaign HTTP", objective: "Entender interesse e encaminhar para a equipe.", listId: list.id, connectionId: connection.id, maxContactsPerDay: 1, maxTurns: 3, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400_000).toISOString(), followUpHours: null };
    const response = await request(`/api/outreach${query}`, master.cookie, "POST", input); assert.equal(response.status, 200); const campaign = await response.json(); assert.equal(campaign.status, "DRAFT"); assert.equal((await (await request(`/api/outreach${query}`, master.cookie, "POST", input)).json()).id, campaign.id);
    assert.equal((await request(`/api/platform/outreach${query}`, admin.cookie)).status, 200); assert.equal((await request(`/api/outreach/${campaign.id}${query}`, master.cookie, "PATCH", { action: "authorize", expectedVersion: 0 })).status, 409);
    assert.equal((await request(`/api/outreach/${campaign.id}${query}`, master.cookie, "PATCH", { action: "authorize", expectedVersion: 0, confirmed: true })).status, 200);
    const state = await request(`/api/outreach${query}`, master.cookie); assert(state.headers.get("cache-control")?.includes("no-store")); const value = await state.json(); assert.equal(value.configuration.configured, false); assert.equal(value.configuration.enabled, false); assert.equal(value.configuration.outboundEnabled, false); assert.equal(value.campaigns[0].status, "ACTIVE");
    assert.equal((await request(`/app/ai-outreach`, master.cookie)).status, 200); assert.equal((await request(`/platform/ai-outreach${query}`, admin.cookie)).status, 200);
    const callback = { event: "messages.upsert", instance: connection.instanceName, apikey: "synthetic-do-not-persist", data: { key: { id: `http-message-${suffix}`, remoteJid: "15555558888@s.whatsapp.net", fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Synthetic async receipt HTTP" } } };
    const path = `/api/webhooks/evolution/${connection.id}`; assert.equal((await request(path, undefined, "POST", callback)).status, 401);
    const headers = { "x-bm-webhook-token": connectionWebhookToken(connection.id) }; const queued = await request(path, undefined, "POST", callback, headers); assert.equal(queued.status, 200); const receipt = await queued.json(); assert.equal(receipt.queued, true); assert(receipt.receiptId);
    const duplicate = await request(path, undefined, "POST", callback, headers); assert.equal((await duplicate.json()).receiptId, receipt.receiptId);
    for (let i = 0; i < 25 && !await db.conversationMessage.count({ where: { tenantId: tenant.id } }); i++) await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(await db.conversationMessage.count({ where: { tenantId: tenant.id } }), 1); assert.equal((await db.messagingReceipt.findUniqueOrThrow({ where: { id: receipt.receiptId } })).status, "PROCESSED");
    assert(!JSON.stringify(await db.messagingReceipt.findMany({ where: { tenantId: tenant.id } })).includes("synthetic-do-not-persist"));
    const metricsPath = `/api/messaging-connection?tenantId=${tenant.id}&connectionId=${connection.id}`; assert.equal((await request(metricsPath, outsider.cookie, "PUT")).status, 403); assert.equal((await request(metricsPath, master.cookie, "PUT")).status, 200);
    assert.equal((await request(`/api/outreach/${campaign.id}${query}`, master.cookie, "PATCH", { action: "pause", expectedVersion: 1 })).status, 200);
    await db.membership.update({ where: { id: master.membership.id }, data: { status: "SUSPENDED" } }); assert.equal((await request(`/api/outreach${query}`, master.cookie)).status, 403);
    assert.equal(await db.outreachTurn.count({ where: { tenantId: tenant.id } }), 0); assert.equal(await db.outboundDispatch.count({ where: { tenantId: tenant.id } }), 0);
    console.log(JSON.stringify({ result: "PASS", deployedHttp: true, authorizedCampaignDeferredActivation: true, authenticationRoleTenantRevocation: true, durableWebhookProcessedByLiveWorker: true, receiptDeduplicationPrivacyMetrics: true, actualMessagesSent: 0, openAICalls: 0 }));
  } finally {
    await db.$transaction(async (transaction) => {
      assert.equal(await transaction.tenant.count({ where: { id: { in: tenants }, slug: { endsWith: suffix } } }), tenants.length);
      const where = { tenantId: { in: tenants } };
      await transaction.messagingConnection.updateMany({ where, data: { enabled: false } }); await transaction.outreachTurn.deleteMany({ where }); await transaction.outreachSession.deleteMany({ where }); await transaction.outreachCampaign.deleteMany({ where });
      await transaction.messageDeliveryEvent.deleteMany({ where }); await transaction.messagingReceipt.deleteMany({ where }); await transaction.conversationMessage.deleteMany({ where }); await transaction.conversation.deleteMany({ where }); await transaction.messagingConnection.deleteMany({ where });
      await transaction.customerListMember.deleteMany({ where }); await transaction.customerList.deleteMany({ where }); await transaction.customerIdentifier.deleteMany({ where }); await transaction.customer.deleteMany({ where });
      await transaction.outboxEvent.deleteMany({ where: { OR: [where, { aggregateId: { in: users } }] } }); await transaction.auditEvent.deleteMany({ where: { OR: [where, { actorUserId: { in: users } }] } });
      await transaction.session.deleteMany({ where: { userId: { in: users } } }); await transaction.membership.deleteMany({ where }); await transaction.tenant.deleteMany({ where: { id: { in: tenants } } }); await transaction.user.deleteMany({ where: { id: { in: users } } });
    }, { timeout: 20_000 });
    console.log("PASS HTTP_FIXTURES_CLEANUP"); await db.$disconnect();
  }
}
void main().catch((error) => { console.error(error instanceof assert.AssertionError ? error.message : "FAIL PROACTIVE_HTTP_ACCEPTANCE"); process.exitCode = 1; });
