import { randomUUID } from "node:crypto";
import { Prisma, type Conversation, type ConversationMessage } from "@prisma/client";
import type { AuthorizationContext } from "@/domain/access";
import { AuthorizationError, NotFoundError } from "@/domain/errors";
import { db } from "@/lib/db";
import { requireCapability } from "@/lib/auth/context";
import { normalizeEvolutionWebhook, verifyWebhookToken, WebhookRequestError, type NormalizedWebhook } from "@/integrations/evolution-webhook";
import { recordEvent, recordNewEvents } from "@/services/events";
import { recordObservedContact } from "@/services/observed-contact";
import { observeOutreachInbound } from "@/services/outreach-inbound";
import { observeCommercialInbound } from "@/services/commercial-events";

export async function authenticateEvolutionWebhook(connectionId: string, token: string | null) {
  verifyWebhookToken(connectionId, token);
  const connection = await db.messagingConnection.findUnique({ where: { id: connectionId }, include: { tenant: { select: { status: true } } } });
  if (!connection) throw new WebhookRequestError(404, "Webhook binding not found");
  if (!connection.enabled || connection.tenant.status !== "ACTIVE") throw new WebhookRequestError(403, "Webhook binding disabled");
}
export async function receiveEvolutionWebhook(connectionId: string, token: string | null, value: unknown) {
  verifyWebhookToken(connectionId, token);
  const event = normalizeEvolutionWebhook(value);
  return db.$transaction((transaction) => applyEvolutionWebhook(transaction, connectionId, event), { timeout: 15_000, maxWait: 10_000 });
}
export async function applyEvolutionWebhook(transaction: Prisma.TransactionClient, connectionId: string, event: NormalizedWebhook) {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-webhook:${connectionId}`}, 0))`;
    const connection = await transaction.messagingConnection.findUnique({ where: { id: connectionId }, include: { tenant: { select: { status: true } } } });
    if (!connection) throw new WebhookRequestError(404, "Webhook binding not found");
    if (!connection.enabled || connection.tenant.status !== "ACTIVE") throw new WebhookRequestError(403, "Webhook binding disabled");
    if (connection.instanceName !== event.instanceName) throw new WebhookRequestError(403, "Webhook instance mismatch");
    if (event.type === "ignored") return { accepted: 0, duplicates: 0, ignored: true };
    if (event.type === "connection") {
      // Compare atomically with polling; old callbacks must not replace a fresh state.
      await transaction.messagingConnection.updateMany({ where: { id: connectionId, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: event.occurredAt } }] }, data: { lastState: event.state, lastCheckedAt: event.occurredAt, lastErrorCode: null } });
      return { accepted: 0, duplicates: 0, ignored: false };
    }
    if (event.type === "deliveries") {
      for (const delivery of event.deliveries) {
        await transaction.messageDeliveryEvent.upsert({ where: { connectionId_providerMessageId_state: { connectionId, providerMessageId: delivery.providerMessageId, state: delivery.state } }, create: { tenantId: connection.tenantId, connectionId, ...delivery }, update: {} });
        await reconcileDelivery(transaction, connectionId, delivery.providerMessageId);
      }
      return { accepted: event.deliveries.length, duplicates: 0, ignored: false };
    }
    let accepted = 0; let duplicates = 0;
    const seen = new Set((await transaction.conversationMessage.findMany({ where: { connectionId, providerMessageId: { in: event.messages.map((item) => item.providerMessageId) } }, select: { providerMessageId: true } })).map((item) => item.providerMessageId));
    const conversations = new Map<string, Conversation>(); const customers = new Map<string, string | null>();
    const newMessages: ConversationMessage[] = []; const contacts = new Map<string, { customerId: string; direction: "INBOUND" | "OUTBOUND"; occurredAt: Date }>();
    for (const message of event.messages) {
      if (seen.has(message.providerMessageId)) { duplicates++; continue; } seen.add(message.providerMessageId);
      const key = { connectionId, remoteJid: message.remoteJid };
      let conversation = conversations.get(message.remoteJid) ?? await transaction.conversation.findUnique({ where: { connectionId_remoteJid: key } });
      let customerId = conversation?.customerId ?? null;
      if (!customerId && message.remoteJid.endsWith("@s.whatsapp.net")) {
        const phone = message.remoteJid.split("@")[0];
        if (!customers.has(phone)) { const matches = await transaction.customerIdentifier.findMany({ where: { tenantId: connection.tenantId, type: "PHONE", normalizedValue: phone, customer: { status: "ACTIVE" } }, select: { customerId: true }, take: 2 }); customers.set(phone, matches.length === 1 ? matches[0].customerId : null); }
        customerId = customers.get(phone) ?? null;
      }
      if (!conversation) conversation = await transaction.conversation.create({ data: { tenantId: connection.tenantId, ...key, customerId, displayName: message.displayName, lastMessageAt: message.occurredAt } });
      else conversation = { ...conversation, customerId, ...(message.occurredAt >= conversation.lastMessageAt ? { lastMessageAt: message.occurredAt, ...(message.displayName ? { displayName: message.displayName } : {}) } : {}) };
      conversations.set(message.remoteJid, conversation);
      const stored: ConversationMessage = { id: randomUUID(), tenantId: connection.tenantId, connectionId, conversationId: conversation.id, providerMessageId: message.providerMessageId, direction: message.direction, kind: message.kind, text: message.text, occurredAt: message.occurredAt, deliveryState: message.direction === "OUTBOUND" ? "SENT" : "RECEIVED", deliveredAt: null, readAt: null, receivedAt: new Date() };
      newMessages.push(stored);
      if (customerId) { const contactKey = `${customerId}:${message.direction}`; const old = contacts.get(contactKey); if (!old || old.occurredAt < message.occurredAt) contacts.set(contactKey, { customerId, direction: message.direction, occurredAt: message.occurredAt }); }
      accepted++;
    }
    for (const conversation of conversations.values()) await transaction.conversation.update({ where: { id: conversation.id }, data: { customerId: conversation.customerId, displayName: conversation.displayName, lastMessageAt: conversation.lastMessageAt } });
    if (newMessages.length) await transaction.conversationMessage.createMany({ data: newMessages });
    for (const contact of contacts.values()) await recordObservedContact(transaction, connection.tenantId, contact.customerId, contact.direction, contact.occurredAt);
    for (const message of newMessages) { if (message.direction === "OUTBOUND") await reconcileDelivery(transaction, connectionId, message.providerMessageId); const customerId = conversations.get(event.messages.find((item) => item.providerMessageId === message.providerMessageId)!.remoteJid)?.customerId ?? null; await observeCommercialInbound(transaction, message, customerId); if (customerId) await observeOutreachInbound(transaction, message, customerId); }
    await recordNewEvents(transaction, newMessages.map((message) => ({ tenantId: connection.tenantId, action: "WHATSAPP_MESSAGE_OBSERVED", entityType: "ConversationMessage", entityId: message.id, metadata: { conversationId: message.conversationId, direction: message.direction, kind: message.kind }, idempotencyKey: `message-observed:${message.id}` })));
    if (newMessages.length) await transaction.messagingConnection.update({ where: { id: connectionId }, data: { ...(newMessages.some((item) => item.direction === "INBOUND") ? { lastInboundAt: new Date() } : {}), ...(newMessages.some((item) => item.direction === "OUTBOUND") ? { lastOutboundAt: new Date() } : {}) } });
    return { accepted, duplicates, ignored: event.messages.length === 0 };
}

async function reconcileDelivery(transaction: Prisma.TransactionClient, connectionId: string, providerMessageId: string) {
  const message = await transaction.conversationMessage.findUnique({ where: { connectionId_providerMessageId: { connectionId, providerMessageId } } });
  if (!message || message.direction !== "OUTBOUND") return;
  const events = await transaction.messageDeliveryEvent.findMany({ where: { connectionId, providerMessageId }, orderBy: { occurredAt: "asc" } });
  const readAt = events.find((item) => item.state === "READ")?.occurredAt ?? message.readAt;
  const deliveredAt = events.find((item) => item.state === "DELIVERED")?.occurredAt ?? message.deliveredAt;
  const deliveryState = readAt ? "READ" : deliveredAt ? "DELIVERED" : events.some((item) => item.state === "FAILED") ? "FAILED" : "SENT";
  await transaction.conversationMessage.update({ where: { id: message.id }, data: { deliveryState, deliveredAt, readAt } });
  if (deliveryState !== message.deliveryState) await recordEvent(transaction, { tenantId: message.tenantId, action: `WHATSAPP_MESSAGE_${deliveryState}`, entityType: "ConversationMessage", entityId: message.id, idempotencyKey: `message-status:${message.id}:${deliveryState}` });
}

export type ConversationActor = { tenantId: string; context: AuthorizationContext } | { tenantId: string; platformUserId: string };
export async function authorizeConversationActor(transaction: Prisma.TransactionClient, actor: ConversationActor) {
  if ("context" in actor) {
    requireCapability(actor.context, "messaging.read");
    if (actor.context.tenantId !== actor.tenantId || !await transaction.membership.findFirst({ where: { id: actor.context.membershipId, tenantId: actor.tenantId, userId: actor.context.userId, role: "TENANT_MASTER", status: "ACTIVE", user: { status: "ACTIVE" }, tenant: { status: "ACTIVE" } } })) throw new AuthorizationError();
  } else if (!await transaction.user.findFirst({ where: { id: actor.platformUserId, status: "ACTIVE", memberships: { some: { role: "PLATFORM_ADMIN", status: "ACTIVE", tenant: { status: "ACTIVE" } } } } })) throw new AuthorizationError();
  if (!await transaction.tenant.findFirst({ where: { id: actor.tenantId, status: "ACTIVE" } })) throw new NotFoundError();
}
export async function listConversations(actor: ConversationActor, page = 1) {
  return db.$transaction(async (transaction) => {
    await authorizeConversationActor(transaction, actor);
    const where = { tenantId: actor.tenantId };
    const [items, total] = await Promise.all([
      transaction.conversation.findMany({ where, orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 25, select: { id: true, remoteJid: true, displayName: true, lastMessageAt: true, customer: { select: { id: true, fullName: true } }, _count: { select: { messages: true } } } }),
      transaction.conversation.count({ where }),
    ]);
    return { items, total, page, pageSize: 25 };
  });
}
export async function getConversation(actor: ConversationActor, conversationId: string, page = 1) {
  return db.$transaction(async (transaction) => {
    await authorizeConversationActor(transaction, actor);
    const conversation = await transaction.conversation.findFirst({ where: { id: conversationId, tenantId: actor.tenantId }, select: { id: true, remoteJid: true, displayName: true, customer: { select: { id: true, fullName: true } } } });
    if (!conversation) throw new NotFoundError();
    const where = { tenantId: actor.tenantId, conversationId };
    const [items, total] = await Promise.all([
      transaction.conversationMessage.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50, select: { id: true, direction: true, kind: true, text: true, occurredAt: true, deliveryState: true, deliveredAt: true, readAt: true } }),
      transaction.conversationMessage.count({ where }),
    ]);
    return { conversation, items, total, page, pageSize: 50 };
  });
}
