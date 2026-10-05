import { Prisma } from "@prisma/client";
import type { AuthorizationContext } from "@/domain/access";
import { AuthorizationError, NotFoundError } from "@/domain/errors";
import { db } from "@/lib/db";
import { requireCapability } from "@/lib/auth/context";
import { normalizeEvolutionWebhook, verifyWebhookToken, WebhookRequestError } from "@/integrations/evolution-webhook";
import { recordEvent } from "@/services/events";

export async function authenticateEvolutionWebhook(connectionId: string, token: string | null) {
  verifyWebhookToken(connectionId, token);
  const connection = await db.messagingConnection.findUnique({ where: { id: connectionId }, include: { tenant: { select: { status: true } } } });
  if (!connection) throw new WebhookRequestError(404, "Webhook binding not found");
  if (!connection.enabled || connection.tenant.status !== "ACTIVE") throw new WebhookRequestError(403, "Webhook binding disabled");
}
export async function receiveEvolutionWebhook(connectionId: string, token: string | null, value: unknown) {
  verifyWebhookToken(connectionId, token);
  const event = normalizeEvolutionWebhook(value);
  return db.$transaction(async (transaction) => {
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
    let accepted = 0; let duplicates = 0;
    for (const message of event.messages) {
      if (await transaction.conversationMessage.findUnique({ where: { connectionId_providerMessageId: { connectionId, providerMessageId: message.providerMessageId } } })) { duplicates++; continue; }
      const key = { connectionId, remoteJid: message.remoteJid };
      let conversation = await transaction.conversation.findUnique({ where: { connectionId_remoteJid: key } });
      let customerId = conversation?.customerId ?? null;
      if (!customerId && message.remoteJid.endsWith("@s.whatsapp.net")) {
        const phone = message.remoteJid.split("@")[0];
        const matches = await transaction.customerIdentifier.findMany({ where: { tenantId: connection.tenantId, type: "PHONE", normalizedValue: phone, customer: { status: "ACTIVE" } }, select: { customerId: true }, take: 2 });
        if (matches.length === 1) customerId = matches[0].customerId;
      }
      if (!conversation) conversation = await transaction.conversation.create({ data: { tenantId: connection.tenantId, ...key, customerId, displayName: message.displayName, lastMessageAt: message.occurredAt } });
      else await transaction.conversation.update({ where: { id: conversation.id }, data: { customerId, ...(message.occurredAt >= conversation.lastMessageAt ? { lastMessageAt: message.occurredAt, ...(message.displayName ? { displayName: message.displayName } : {}) } : {}) } });
      const stored = await transaction.conversationMessage.create({ data: { tenantId: connection.tenantId, connectionId, conversationId: conversation.id, providerMessageId: message.providerMessageId, direction: message.direction, kind: message.kind, text: message.text, occurredAt: message.occurredAt } });
      await recordEvent(transaction, { tenantId: connection.tenantId, action: "WHATSAPP_MESSAGE_OBSERVED", entityType: "ConversationMessage", entityId: stored.id, metadata: { conversationId: conversation.id, direction: message.direction, kind: message.kind }, idempotencyKey: `message-observed:${stored.id}` });
      accepted++;
    }
    return { accepted, duplicates, ignored: event.messages.length === 0 };
  }, { timeout: 15_000, maxWait: 10_000 });
}

export type ConversationActor = { tenantId: string; context: AuthorizationContext } | { tenantId: string; platformUserId: string };
export async function authorizeConversationActor(transaction: Prisma.TransactionClient, actor: ConversationActor) {
  if ("context" in actor) {
    requireCapability(actor.context, "messaging.read");
    if (actor.context.tenantId !== actor.tenantId || !await transaction.membership.findFirst({ where: { id: actor.context.membershipId, tenantId: actor.tenantId, userId: actor.context.userId, role: "TENANT_MASTER", status: "ACTIVE", user: { status: "ACTIVE" }, tenant: { status: "ACTIVE" } } })) throw new AuthorizationError();
  } else if (!await transaction.user.findFirst({ where: { id: actor.platformUserId, status: "ACTIVE", memberships: { some: { role: "PLATFORM_ADMIN", status: "ACTIVE" } } } })) throw new AuthorizationError();
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
      transaction.conversationMessage.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50, select: { id: true, direction: true, kind: true, text: true, occurredAt: true } }),
      transaction.conversationMessage.count({ where }),
    ]);
    return { conversation, items, total, page, pageSize: 50 };
  });
}
