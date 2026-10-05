import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { roleCapabilities, type AuthorizationContext } from "@/domain/access";
import { connectionWebhookToken } from "@/integrations/evolution-webhook";
import { getConversation, listConversations, receiveEvolutionWebhook } from "@/services/conversation-service";

async function main() {
  try {
    const schema = process.env.ACCEPTANCE_ISOLATED_SCHEMA;
    assert(schema && /^phase5inbox_acceptance_[a-f0-9]{32}$/.test(schema));
    assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
    process.env.EVOLUTION_WEBHOOK_SECRET = "synthetic-isolated-webhook-secret-32-characters";
    const suffix = randomUUID();
    const tenant = await db.tenant.create({ data: { name: "Synthetic Inbox", slug: `inbox-${suffix}` } });
    const foreign = await db.tenant.create({ data: { name: "Foreign Inbox", slug: `foreign-inbox-${suffix}` } });
    const user = await db.user.create({ data: { name: "Synthetic Master", email: `inbox-${suffix}@example.invalid`, status: "ACTIVE" } });
    const membership = await db.membership.create({ data: { userId: user.id, tenantId: tenant.id, status: "ACTIVE", role: "TENANT_MASTER" } });
    const context: AuthorizationContext = { tenantId: tenant.id, userId: user.id, membershipId: membership.id, role: "TENANT_MASTER", accessScope: "TENANT", capabilities: roleCapabilities.TENANT_MASTER };
    const actor = { tenantId: tenant.id, context };
    const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: "synthetic_inbox" } });
    const foreignConnection = await db.messagingConnection.create({ data: { tenantId: foreign.id, instanceName: "foreign_inbox" } });
    const token = connectionWebhookToken(connection.id);
    const phone = "5511999990000";
    const customer = await db.customer.create({ data: { tenantId: tenant.id, fullName: "Synthetic Customer", displayName: "Synthetic Customer", identifiers: { create: { type: "PHONE", normalizedValue: phone } } } });
    const foreignCustomer = await db.customer.create({ data: { tenantId: foreign.id, fullName: "Foreign Customer", displayName: "Foreign Customer", identifiers: { create: { type: "PHONE", normalizedValue: phone } } } });
    const now = Math.floor(Date.now() / 1000);
    const data = { key: { id: "synthetic-message-1", remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, messageTimestamp: now, pushName: "Synthetic Contact", message: { conversation: "synthetic-message-body" } };
    const envelope = { event: "messages.upsert", instance: connection.instanceName, apikey: "synthetic-provider-secret", data };
    const results = await Promise.all([receiveEvolutionWebhook(connection.id, token, envelope), receiveEvolutionWebhook(connection.id, token, envelope)]);
    assert.equal(results.reduce((sum, result) => sum + result.accepted, 0), 1);
    assert.equal(results.reduce((sum, result) => sum + result.duplicates, 0), 1);
    assert.equal(await db.conversationMessage.count(), 1);
    let conversation = await db.conversation.findFirstOrThrow({ where: { tenantId: tenant.id } });
    assert.equal(conversation.customerId, customer.id);
    await assert.rejects(receiveEvolutionWebhook(foreignConnection.id, token, { ...envelope, instance: foreignConnection.instanceName }), { status: 401 });
    await assert.rejects(receiveEvolutionWebhook(connection.id, token, { ...envelope, instance: foreignConnection.instanceName }), { status: 403 });
    const older = { ...envelope, data: { ...data, key: { ...data.key, id: "older-message", fromMe: true }, messageTimestamp: now - 100, pushName: "Own phone name" } };
    await receiveEvolutionWebhook(connection.id, token, older);
    conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    assert.equal(conversation.lastMessageAt.valueOf(), now * 1000);
    assert.equal(conversation.displayName, "Synthetic Contact");
    await assert.rejects(receiveEvolutionWebhook(connection.id, token, { ...envelope, data: [{ ...data, key: { ...data.key, id: "rolled-back" } }, {}] }), { status: 400 });
    assert.equal(await db.conversationMessage.count(), 2);
    const audit = JSON.stringify(await db.auditEvent.findMany());
    const outbox = JSON.stringify(await db.outboxEvent.findMany());
    for (const stored of [audit, outbox]) { assert(!stored.includes("synthetic-message-body")); assert(!stored.includes(token)); assert(!stored.includes("synthetic-provider-secret")); }
    assert.equal((await listConversations(actor)).total, 1);
    assert.equal((await getConversation(actor, conversation.id)).total, 2);
    await assert.rejects(listConversations({ tenantId: foreign.id, context }), /./);
    await assert.rejects(getConversation({ tenantId: foreign.id, context: { ...context, tenantId: foreign.id } }, conversation.id));
    await assert.rejects(listConversations({ tenantId: tenant.id, context: { ...context, role: "CONSULTANT", capabilities: [] } }));
    await assert.rejects(db.conversation.update({ where: { id: conversation.id }, data: { customerId: foreignCustomer.id } }));
    await db.membership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
    await assert.rejects(listConversations(actor));
    await db.messagingConnection.update({ where: { id: connection.id }, data: { enabled: false } });
    await assert.rejects(receiveEvolutionWebhook(connection.id, token, envelope), { status: 403 });
    await db.messagingConnection.update({ where: { id: connection.id }, data: { enabled: true, lastCheckedAt: new Date(now * 1000), lastState: "OPEN" } });
    await receiveEvolutionWebhook(connection.id, token, { event: "connection.update", instance: connection.instanceName, date_time: new Date((now - 1) * 1000).toISOString(), data: { state: "close" } });
    assert.equal((await db.messagingConnection.findUniqueOrThrow({ where: { id: connection.id } })).lastState, "OPEN");
    await db.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
    await assert.rejects(receiveEvolutionWebhook(connection.id, token, envelope), { status: 403 });
    console.log(JSON.stringify({ result: "PASS", concurrentDeduplication: true, scopedCustomerMatch: true, crossTenantForeignKey: true, authorizationRevalidated: true, staleEventProtected: true, noContentOrSecretsInAuditOutbox: true, messagesSent: 0 }));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Inbox isolated acceptance failed"); process.exitCode = 1; });
