import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { roleCapabilities, roleAccessScope, type AuthorizationContext } from "@/domain/access";
import { downloadMessageMedia } from "@/services/message-media-service";
import { createCRMCase, assignCustomer } from "@/services/crm-service";
import { receiveEvolutionWebhook } from "@/services/conversation-service";
import { connectionWebhookToken } from "@/integrations/evolution-webhook";
import { EvolutionProvider } from "@/integrations/evolution-provider";
import type { MessageMediaProvider } from "@/domain/message-media";

async function member(tenantId: string, role: Role) { const user = await db.user.create({ data: { name: `Synthetic media ${role}`, email: `media-${randomUUID()}@example.invalid`, status: "ACTIVE" } }); const membership = await db.membership.create({ data: { tenantId, userId: user.id, role, status: "ACTIVE" } }); const context: AuthorizationContext = { tenantId, userId: user.id, membershipId: membership.id, role, accessScope: roleAccessScope[role], capabilities: roleCapabilities[role] }; return { tenantId, context }; }
async function main() {
  const schema = process.env.ACCEPTANCE_ISOLATED_SCHEMA; assert(schema && /^phase12_acceptance_[a-f0-9]{32}$/.test(schema)); assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
  try {
    const suffix = randomUUID(); const tenant = await db.tenant.create({ data: { name: "Synthetic media", slug: `media-${suffix}` } }); const foreign = await db.tenant.create({ data: { name: "Foreign media", slug: `media-foreign-${suffix}` } });
    const [master, manager, consultant, outsider, foreignMaster, admin] = await Promise.all([member(tenant.id, "TENANT_MASTER"), member(tenant.id, "TENANT_MANAGER"), member(tenant.id, "CONSULTANT"), member(tenant.id, "CONSULTANT"), member(foreign.id, "TENANT_MASTER"), member(tenant.id, "PLATFORM_ADMIN")]);
    const customer = await db.customer.create({ data: { tenantId: tenant.id, fullName: "Synthetic media customer", displayName: "Synthetic media customer" } }); const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `media_${suffix.replaceAll("-", "")}` } });
    const callback = { event: "messages.upsert", instance: connection.instanceName, data: { key: { id: "synthetic-media-message", remoteJid: "15555550101@s.whatsapp.net", fromMe: false }, message: { documentMessage: { mimetype: "application/pdf", caption: "Synthetic private media caption", url: "https://foreign.example.invalid/private", mediaKey: "secret-media-key", fileName: "../../foreign.html" } }, messageTimestamp: Math.floor(Date.now() / 1000) } };
    await receiveEvolutionWebhook(connection.id, connectionWebhookToken(connection.id), callback);
    const conversation = await db.conversation.findFirstOrThrow({ where: { tenantId: tenant.id } }); await db.conversation.update({ where: { id: conversation.id }, data: { customerId: customer.id } }); const message = await db.conversationMessage.findFirstOrThrow({ where: { conversationId: conversation.id } });
    assert(!JSON.stringify(message).includes("secret-media-key")); assert(!JSON.stringify(message).includes("foreign.example.invalid"));
    await createCRMCase(master, { customerId: customer.id, conversationId: conversation.id, title: "Synthetic media case", requestKey: randomUUID() });
    const team = await db.team.create({ data: { tenantId: tenant.id, name: "Synthetic media team" } }); for (const actor of [manager, consultant, outsider]) await db.teamMember.create({ data: { tenantId: tenant.id, teamId: team.id, userId: actor.context.userId } });
    const assignment = await assignCustomer(master, customer.id, { teamId: team.id, assignedMembershipId: consultant.context.membershipId, expectedVersion: null });
    const bytes = Buffer.from("%PDF-1.4\nSynthetic private media bytes\n%%EOF"); let calls = 0;
    const provider = new EvolutionProvider("https://provider.example.invalid", "synthetic-secret", async (url, options) => { calls++; assert.equal(url, `https://provider.example.invalid/chat/getBase64FromMediaMessage/${connection.instanceName}`); assert.deepEqual(JSON.parse(options!.body as string), { message: { key: { id: message.providerMessageId, remoteJid: conversation.remoteJid, fromMe: false } }, convertToMp4: false }); return Response.json({ mediaType: "documentMessage", mimetype: "application/pdf", base64: bytes.toString("base64"), url: "https://discard.example.invalid", fileName: "../../discard.html" }); });
    for (const [actor, source] of [[master, "inbox"], [manager, "crm"], [consultant, "crm"], [{ tenantId: tenant.id, platformUserId: admin.context.userId }, "inbox"]] as const) { const result = await downloadMessageMedia(actor, conversation.id, message.id, source, provider); assert.deepEqual(result.bytes, bytes); assert.equal(result.fileName, `whatsapp-${message.id}.pdf`); }
    const beforeDenied = calls;
    await assert.rejects(downloadMessageMedia(consultant, conversation.id, message.id, "inbox", provider)); await assert.rejects(downloadMessageMedia(outsider, conversation.id, message.id, "crm", provider));
    await assert.rejects(downloadMessageMedia(foreignMaster, conversation.id, message.id, "inbox", provider)); await assert.rejects(downloadMessageMedia(master, conversation.id, "missing-message", "inbox", provider)); assert.equal(calls, beforeDenied);
    const revokedProvider: MessageMediaProvider = { getMessageMedia: async () => { await db.membership.update({ where: { id: consultant.context.membershipId }, data: { status: "SUSPENDED" } }); return { bytes, mimeType: "application/pdf", extension: "pdf" }; } };
    await assert.rejects(downloadMessageMedia(consultant, conversation.id, message.id, "crm", revokedProvider)); await db.membership.update({ where: { id: consultant.context.membershipId }, data: { status: "ACTIVE" } });
    const reassignedProvider: MessageMediaProvider = { getMessageMedia: async () => { await assignCustomer(master, customer.id, { teamId: team.id, assignedMembershipId: outsider.context.membershipId, expectedVersion: assignment.version }); return { bytes, mimeType: "application/pdf", extension: "pdf" }; } };
    await assert.rejects(downloadMessageMedia(consultant, conversation.id, message.id, "crm", reassignedProvider));
    await db.messagingConnection.update({ where: { id: connection.id }, data: { enabled: false } }); await assert.rejects(downloadMessageMedia(master, conversation.id, message.id, "inbox", provider));
    assert.equal(await db.auditEvent.count({ where: { action: "WHATSAPP_MEDIA_DOWNLOADED" } }), 4);
    for (const value of [await db.auditEvent.findMany(), await db.outboxEvent.findMany()]) for (const sensitive of ["Synthetic private media caption", "Synthetic private media bytes", "secret-media-key", "foreign.example.invalid", bytes.toString("base64")]) assert(!JSON.stringify(value).includes(sensitive));
    console.log(JSON.stringify({ result: "PASS", phase: 12, simulatedProviderRetrieval: true, tenantTeamAndAssignedMediaScope: true, revokedAndReassignedDownloadsDiscarded: true, disabledBindingRejected: true, providerUrlsAndKeysNotPersisted: true, safeContentFreeAudit: true, realProviderCalls: 0, actualMessagesSent: 0 }));
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(JSON.stringify({ result: "FAIL", error: error instanceof Error ? error.message : "Media acceptance failed" })); process.exitCode = 1; });
