import assert from "node:assert/strict";
import { syntheticPlaybook } from "./fixtures/commercial";
import { createPlaybook, changePlaybook } from "@/services/commercial-service";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { roleCapabilities, type AuthorizationContext } from "@/domain/access";
import { createOutreachCampaign, changeOutreachCampaign, processOutreachBatch, controlOutreachSession, listOutreach } from "@/services/outreach-service";
import { registerEvolutionConnection, getMessagingConnection } from "@/services/messaging-connection-service";
import { controlConnection, connectionMetrics } from "@/services/messaging-control-service";
import { processConnectionHealthBatch } from "@/services/messaging-health-service";
import { enqueueEvolutionWebhook, processMessagingReceiptBatch } from "@/services/messaging-receipt-service";
import { connectionWebhookToken } from "@/integrations/evolution-webhook";
import { processOutboundBatch, retryOutbound } from "@/services/outbound-service";
import { saveCommunicationPreference, saveMessagingPolicy } from "@/services/messaging-governance";
import { AuthorizationError } from "@/domain/errors";
import type { generateOutreach } from "@/integrations/outreach-gateway";
import { assertTestHooksAllowed } from "@/services/test-hooks";

async function main() {
  assertTestHooksAllowed(true);
  const schema = process.env.ACCEPTANCE_ISOLATED_SCHEMA; assert(schema && /^phase13_acceptance_[a-f0-9]{32}$/.test(schema)); assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
  // Overrides apply only to this process and its isolated schema. No real provider/key is used.
  process.env.OPENAI_API_KEY = "synthetic-isolated"; process.env.EVOLUTION_API_URL = "https://example.invalid"; process.env.EVOLUTION_API_KEY = "synthetic-isolated";
  process.env.EVOLUTION_WEBHOOK_SECRET = "synthetic-isolated-webhook-secret-32-characters"; process.env.AI_OUTREACH_ENABLED = "true"; process.env.WHATSAPP_OUTBOUND_ENABLED = "true";
  const tenant = await db.tenant.create({ data: { name: "Synthetic proactive", slug: randomUUID() } });
  const foreign = await db.tenant.create({ data: { name: "Foreign proactive", slug: randomUUID() } });
  const user = await db.user.create({ data: { name: "Synthetic master", email: `${randomUUID()}@example.invalid`, status: "ACTIVE" } });
  const membership = await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "TENANT_MASTER", status: "ACTIVE" } });
  const admin = await db.user.create({ data: { name: "Synthetic admin", email: `${randomUUID()}@example.invalid`, status: "ACTIVE" } });
  await db.membership.create({ data: { tenantId: tenant.id, userId: admin.id, role: "PLATFORM_ADMIN", status: "ACTIVE" } });
  const context: AuthorizationContext = { tenantId: tenant.id, userId: user.id, membershipId: membership.id, role: "TENANT_MASTER", accessScope: "TENANT", capabilities: roleCapabilities.TENANT_MASTER }; const actor = { tenantId: tenant.id, context };
  const connections = [];
  for (let i = 0; i < 10; i++) connections.push(await registerEvolutionConnection(admin.id, { tenantId: tenant.id, instanceName: `synthetic_${i}` }));
  assert.equal(connections.filter((item) => item.isDefault).length, 1); assert.equal((await getMessagingConnection(context))!.id, connections[0].id);
  await controlConnection(actor, connections[1].id, { action: "default" }); assert.equal((await getMessagingConnection(context))!.id, connections[1].id);
  await assert.rejects(controlConnection({ ...actor, tenantId: foreign.id }, connections[0].id, { action: "disable" }), AuthorizationError);
  for (let i = 0; i < 3; i++) { await db.messagingConnection.updateMany({ data: { nextHealthAt: new Date(0) } }); await processConnectionHealthBatch({ name: "STUB", getConnectionState: async () => "CLOSED" }); }
  assert.equal((await db.messagingConnection.findUniqueOrThrow({ where: { id: connections[0].id } })).circuitState, "OPEN");
  await db.messagingConnection.updateMany({ data: { nextHealthAt: new Date(0) } }); await processConnectionHealthBatch({ name: "STUB", getConnectionState: async () => "OPEN" });
  assert.equal((await db.messagingConnection.findUniqueOrThrow({ where: { id: connections[0].id } })).circuitState, "CLOSED");
  console.log("PASS TEN_CONNECTIONS_DEFAULT_OWNERSHIP_HEALTH_CIRCUIT_RECOVERY");
  const connection = connections[0]; const token = connectionWebhookToken(connection.id);
  const message = (id: string, text: string, fromMe = false, phone = "15555550001") => ({ event: "messages.upsert", instance: connection.instanceName, apikey: "must-never-persist", data: { key: { id, remoteJid: `${phone}@s.whatsapp.net`, fromMe }, message: { conversation: text }, messageTimestamp: Math.floor(Date.now() / 1000) } });
  const receipt = await Promise.all([enqueueEvolutionWebhook(connection.id, token, message("duplicate", "Hello")), enqueueEvolutionWebhook(connection.id, token, message("duplicate", "Hello"))]);
  assert.equal(receipt[0].receiptId, receipt[1].receiptId); assert.equal(await db.conversationMessage.count(), 0);
  assert(!JSON.stringify(await db.messagingReceipt.findMany()).includes("must-never-persist"));
  await Promise.all([processMessagingReceiptBatch(), processMessagingReceiptBatch()]); assert.equal(await db.conversationMessage.count(), 1);
  await enqueueEvolutionWebhook(connection.id, token, { event: "messages.update", instance: connection.instanceName, data: { keyId: "delayed-out", fromMe: true, status: "READ" } }); await processMessagingReceiptBatch();
  await enqueueEvolutionWebhook(connection.id, token, message("delayed-out", "Text", true)); await processMessagingReceiptBatch();
  assert.equal((await db.conversationMessage.findUniqueOrThrow({ where: { connectionId_providerMessageId: { connectionId: connection.id, providerMessageId: "delayed-out" } } })).deliveryState, "READ");
  await enqueueEvolutionWebhook(connection.id, token, { event: "messages.update", instance: connection.instanceName, data: { keyId: "delayed-out", fromMe: true, status: "DELIVERY_ACK" } }); await processMessagingReceiptBatch();
  const delivered = await db.conversationMessage.findUniqueOrThrow({ where: { connectionId_providerMessageId: { connectionId: connection.id, providerMessageId: "delayed-out" } } }); assert.equal(delivered.deliveryState, "READ"); assert(delivered.deliveredAt && delivered.readAt);
  const stale = await enqueueEvolutionWebhook(connection.id, token, message("recovered", "After restart")); await db.messagingReceipt.update({ where: { id: stale.receiptId! }, data: { status: "PROCESSING", lockToken: "lost-worker", lockedAt: new Date(Date.now() - 130_000) } }); await processMessagingReceiptBatch(); assert.equal((await db.messagingReceipt.findUniqueOrThrow({ where: { id: stale.receiptId! } })).status, "PROCESSED");
  const dead = await enqueueEvolutionWebhook(connection.id, token, message("dlq", "Retry safely")); await controlConnection(actor, connection.id, { action: "disable" }); await processMessagingReceiptBatch(); assert.equal((await db.messagingReceipt.findUniqueOrThrow({ where: { id: dead.receiptId! } })).status, "DEAD_LETTER"); await controlConnection(actor, connection.id, { action: "enable" }); await controlConnection(actor, connection.id, { action: "retry-receipt", receiptId: dead.receiptId! }); await processMessagingReceiptBatch(); assert.equal((await db.messagingReceipt.findUniqueOrThrow({ where: { id: dead.receiptId! } })).status, "PROCESSED");
  console.log("PASS DURABLE_ACK_DEDUPLICATION_DELIVERY_BEFORE_MESSAGE_MONOTONIC_READ_RESTART_DLQ");
  await saveMessagingPolicy(actor, { timeZone: "America/Sao_Paulo", startHour: 0, endHour: 24, minIntervalMinutes: 0, enabledChannels: ["WHATSAPP"] });
  const list = await db.customerList.create({ data: { tenantId: tenant.id, name: "Synthetic authorized audience" } }); let sequence = 0;
  async function customer(consent: "OPTED_IN" | "OPTED_OUT" | "UNKNOWN" = "OPTED_IN") { const value = await db.customer.create({ data: { tenantId: tenant.id, fullName: `Synthetic ${++sequence}`, displayName: `Synthetic ${sequence}` } }); await db.customerIdentifier.create({ data: { tenantId: tenant.id, customerId: value.id, type: "PHONE", verification: "CONFIRMED", normalizedValue: `1555555${String(sequence).padStart(4, "0")}` } }); await db.customerListMember.create({ data: { tenantId: tenant.id, customerId: value.id, listId: list.id } }); await saveCommunicationPreference(actor, value.id, { channel: "WHATSAPP", consent, evidence: "Synthetic isolated evidence only" }); return value; }
  const target = await customer(); await customer("OPTED_OUT"); await customer("UNKNOWN");
  let playbook = await createPlaybook(actor, { name: "Synthetic strategy", instruction: "Converse de forma cordial e encaminhe sem prometer crédito." });
  playbook = await changePlaybook(actor, playbook.id, { action: "edit", expectedVersion: playbook.version, instruction: playbook.instruction, interpretation: syntheticPlaybook });
  playbook = await changePlaybook(actor, playbook.id, { action: "approve", expectedVersion: playbook.version, confirmed: true });
  const campaignInput = { playbookId: playbook.id, requestKey: randomUUID(), name: "Synthetic proactive", objective: "Entender interesse e encaminhar à equipe.", listId: list.id, connectionId: connection.id, maxContactsPerDay: 1, maxTurns: 3, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 86400_000).toISOString(), followUpHours: 24 };
  const duplicateCampaign = await Promise.all([createOutreachCampaign(actor, campaignInput), createOutreachCampaign(actor, campaignInput)]); assert.equal(duplicateCampaign[0].id, duplicateCampaign[1].id);
  await assert.rejects(createOutreachCampaign(actor, { ...campaignInput, objective: "Changed objective invalidates same key" }));
  await assert.rejects(changeOutreachCampaign(actor, duplicateCampaign[0].id, { action: "authorize", expectedVersion: 0 }));
  await assert.rejects(listOutreach({ ...actor, context: { ...context, role: "CONSULTANT", capabilities: roleCapabilities.CONSULTANT, accessScope: "ASSIGNED" } }), AuthorizationError);
  let generated = 0; const generator: typeof generateOutreach = async (input) => { generated++; return { result: { message: input.stage === "INITIAL" ? "Oi, sou a Vanessa da BM Crédito. Você tem um tempinho para conversar?" : "Obrigado! Qual necessidade você gostaria de conversar com a equipe?", intent: input.stage === "INITIAL" ? "INTRODUCTION" : "QUESTION", nextStep: "CONTINUE", evidenceIds: input.messages.slice(-1).map((item) => item.id) }, inputTokens: 100, outputTokens: 40 }; };
  await processOutreachBatch(generator); assert.equal(generated, 0); await changeOutreachCampaign(actor, duplicateCampaign[0].id, { action: "authorize", expectedVersion: 0, confirmed: true });
  await customer(); // Added after authorization: outside the frozen audience.
  await Promise.all([processOutreachBatch(generator), processOutreachBatch(generator)]); assert.equal(generated, 1); assert.equal(await db.outreachSession.count(), 1); const session = await db.outreachSession.findFirstOrThrow(); assert.equal(session.customerId, target.id);
  assert.equal(await db.outboundDispatch.count({ where: { status: "QUEUED" } }), 1);
  assert.equal((await db.outboundDispatch.findFirstOrThrow()).connectionId, connection.id);
  let sends = 0; let offline = false; let ambiguous = false;
  const runtime = { enabled: () => true, configured: () => true, provider: () => ({ name: "STUB", getConnectionState: async () => offline ? "CLOSED" as const : "OPEN" as const, sendText: async () => { sends++; if (ambiguous) throw new Error("Network lost after POST"); return { providerMessageId: `synthetic-send-${sends}`, remoteJid: "15555550001@s.whatsapp.net" }; } }) };
  offline = true; await processOutboundBatch(runtime); assert.equal(sends, 0); assert.equal((await db.outboundDispatch.findFirstOrThrow()).status, "QUEUED"); assert((await db.outboundDispatch.findFirstOrThrow()).nextAttemptAt > new Date()); offline = false; await db.outboundDispatch.updateMany({ data: { nextAttemptAt: new Date(0) } });
  await Promise.all([processOutboundBatch(runtime), processOutboundBatch(runtime)]); assert.equal(sends, 1); assert.equal((await db.outreachTurn.findFirstOrThrow()).status, "SENT");
  assert.equal((await db.customer.findUniqueOrThrow({ where: { id: target.id } })).lastOutboundAt, null);
  await enqueueEvolutionWebhook(connection.id, token, message("customer-reply", "Gostaria de conversar", false)); await processMessagingReceiptBatch(); await processOutreachBatch(generator); assert.equal(generated, 2);
  await controlOutreachSession(actor, session.id, { control: "HUMAN", expectedVersion: 0 }); await processOutboundBatch(runtime); assert.equal(sends, 1);
  await controlOutreachSession(actor, session.id, { control: "AI", expectedVersion: 1 }); await enqueueEvolutionWebhook(connection.id, token, message("latest-reply", "Tenho interesse", false)); await processMessagingReceiptBatch(); await processOutreachBatch(generator);
  const beforePause = sends; await changeOutreachCampaign(actor, duplicateCampaign[0].id, { action: "pause", expectedVersion: 1 }); await processOutboundBatch(runtime); assert.equal(sends, beforePause);
  await changeOutreachCampaign(actor, duplicateCampaign[0].id, { action: "authorize", expectedVersion: 2, confirmed: true }); await processOutreachBatch(generator);
  await enqueueEvolutionWebhook(connection.id, token, message("optout", "Não quero mais mensagens", false)); await processMessagingReceiptBatch(); await processOutboundBatch(runtime); assert.equal(sends, beforePause); assert.equal((await db.outreachSession.findUniqueOrThrow({ where: { id: session.id } })).control, "STOPPED"); assert.equal((await db.communicationPreference.findFirstOrThrow({ where: { customerId: target.id } })).consent, "OPTED_OUT");
  process.env.AI_OUTREACH_ENABLED = "false"; const beforeDisabled = generated; await processOutreachBatch(generator); assert.equal(generated, beforeDisabled); process.env.AI_OUTREACH_ENABLED = "true";
  await db.membership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } }); await assert.rejects(listOutreach(actor), AuthorizationError); await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
  console.log("PASS INITIAL_WITHOUT_INBOUND_FROZEN_AUDIENCE_CONSENT_DAILY_LIMIT_CONCURRENT_WORKERS_REPLY_HUMAN_PAUSE_OPTOUT_FLAGS_AUTH_REVOCATION");
  const retryList = await db.customerList.create({ data: { tenantId: tenant.id, name: "Synthetic recovery audience" } });
  const recovery = await customer(); await db.customerListMember.create({ data: { tenantId: tenant.id, listId: retryList.id, customerId: recovery.id } });
  const retryCampaign = await createOutreachCampaign(actor, { ...campaignInput, requestKey: randomUUID(), name: "Recovery", listId: retryList.id, maxContactsPerDay: 1 }); await changeOutreachCampaign(actor, retryCampaign.id, { action: "authorize", expectedVersion: 0, confirmed: true }); await processOutreachBatch(generator);
  const recoverySession = await db.outreachSession.findUniqueOrThrow({ where: { campaignId_customerId: { campaignId: retryCampaign.id, customerId: recovery.id } } });
  let recoveryDispatch = await db.outboundDispatch.findFirstOrThrow({ where: { customerId: recovery.id } }); offline = true;
  for (let attempt = 0; attempt < 5; attempt++) { await db.outboundDispatch.update({ where: { id: recoveryDispatch.id }, data: { nextAttemptAt: new Date(0) } }); await processOutboundBatch(runtime); }
  recoveryDispatch = await db.outboundDispatch.findUniqueOrThrow({ where: { id: recoveryDispatch.id } }); assert.equal(recoveryDispatch.status, "DEAD_LETTER"); assert.equal(sends, 1);
  await assert.rejects(retryOutbound(actor, recoveryDispatch.id, { expectedVersion: recoveryDispatch.version, confirmed: false } as never));
  await retryOutbound(actor, recoveryDispatch.id, { expectedVersion: recoveryDispatch.version, confirmed: true }, runtime); offline = false; ambiguous = true;
  await processOutboundBatch(runtime); assert.equal(sends, 2); assert.equal((await db.outboundDispatch.findUniqueOrThrow({ where: { id: recoveryDispatch.id } })).status, "UNCERTAIN"); ambiguous = false; await processOutboundBatch(runtime); assert.equal(sends, 2); await assert.rejects(retryOutbound(actor, recoveryDispatch.id, { expectedVersion: (await db.outboundDispatch.findUniqueOrThrow({ where: { id: recoveryDispatch.id } })).version, confirmed: true }, runtime));
  await enqueueEvolutionWebhook(connection.id, token, message("human-request", "Quero falar com um consultor", false, `1555555${String(sequence).padStart(4, "0")}`)); await processMessagingReceiptBatch();
  process.env.AI_OUTREACH_ENABLED = "false"; await processOutreachBatch(generator); assert.equal((await db.outreachSession.findUniqueOrThrow({ where: { id: recoverySession.id } })).control, "HUMAN"); assert.equal(await db.cRMCase.count({ where: { customerId: recovery.id } }), 1);
  console.log("PASS FIVE_SAFE_RETRIES_DLQ_MANUAL_AUTHORIZATION_AMBIGUOUS_NOT_RETRIED_HUMAN_HANDOFF_TO_CRM_WITHOUT_AI_CALL");
  // Messaging load is separate from import load. Real isolated SQL, normalized provider messages; no external API calls.
  const workloads = process.env.MESSAGING_LOAD_SKIP === "true" ? [] : [[2000, 1], [5000, 5], [10000, 10]];
  const results = [];
  for (const [size, count] of workloads) {
    const started = Date.now(); const before = await db.conversationMessage.count();
    for (let offset = 0; offset < size; offset += 50) {
      const selected = connections[Math.floor(offset / 50) % count]; const rows = Array.from({ length: Math.min(50, size - offset) }, (_, i) => ({ key: { id: `load-${size}-${offset + i}`, remoteJid: "15555559999@s.whatsapp.net", fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Synthetic load message" } }));
      await enqueueEvolutionWebhook(selected.id, connectionWebhookToken(selected.id), { event: "messages.upsert", instance: selected.instanceName, data: rows });
    }
    while (await db.messagingReceipt.count({ where: { status: "QUEUED" } })) await processMessagingReceiptBatch(200);
    assert.equal(await db.conversationMessage.count() - before, size); assert.equal(await db.messagingReceipt.count({ where: { status: "DEAD_LETTER" } }), 0);
    results.push({ messages: size, connections: count, durationMs: Date.now() - started });
  }
  assert((await connectionMetrics(actor, connection.id)).latencySamples > 0);
  assert.equal(sends, 2);
  console.log(`PHASE_13_ACCEPTANCE_JSON=${JSON.stringify({ result: "PASS", provider: "SIMULATED", realOutboundCalls: 0, realOpenAICalls: 0, simulatedSends: sends, load: results })}`);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

