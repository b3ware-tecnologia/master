import type { ConversationMessage, Prisma } from "@prisma/client";
import { lockMessagingTarget } from "@/services/messaging-locks";
import { recordEvent } from "@/services/events";
import { classifyExplicitContactRequest } from "@/domain/commercial";

export async function observeOutreachInbound(transaction: Prisma.TransactionClient, message: ConversationMessage, customerId: string | null) {
  if (message.direction !== "INBOUND" || !customerId) return;
  await lockMessagingTarget(transaction, message.tenantId, customerId);
  const session = await transaction.outreachSession.findFirst({ where: { tenantId: message.tenantId, customerId, control: "AI", campaign: { connectionId: message.connectionId, status: { in: ["ACTIVE", "PAUSED"] } } }, include: { campaign: true }, orderBy: { createdAt: "desc" } });
  if (!session) return;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outreach-campaign:${session.campaignId}`}, 0))`;
  const text = (message.text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  const optOut = classifyExplicitContactRequest(message.text ?? "") === "OPT_OUT";
  const human = message.kind !== "TEXT" || /\b(atendente|consultor|pessoa|humano|gerente)\b/.test(text);
  await transaction.outreachSession.update({ where: { id: session.id }, data: { conversationId: message.conversationId, ...(optOut || human ? { control: optOut ? "STOPPED" : "HUMAN", version: { increment: 1 }, handoffReason: optOut ? "CUSTOMER_OPTED_OUT" : "HUMAN_REQUEST" } : {}) } });
  await transaction.outreachTurn.updateMany({ where: { sessionId: session.id, status: { in: ["QUEUED", "RUNNING", "READY"] } }, data: { status: "CANCELLED", lockToken: null, errorCode: "NEW_INBOUND_MESSAGE" } });
  if (human) await transaction.opportunity.updateMany({ where: { sessionId: session.id, tenantId: message.tenantId, stage: { notIn: ["WON", "LOST", "DO_NOT_CONTACT"] } }, data: { stage: "HUMAN_HANDOFF", handoffAt: new Date(), version: { increment: 1 } } });
  if (optOut && session.campaign.authorizedById) {
    const evidence = "Pedido explícito para interromper contato recebido pelo WhatsApp.";
    await transaction.communicationPreference.upsert({ where: { tenantId_customerId_channel: { tenantId: message.tenantId, customerId, channel: "WHATSAPP" } }, create: { tenantId: message.tenantId, customerId, channel: "WHATSAPP", consent: "OPTED_OUT", evidence, recordedById: session.campaign.authorizedById }, update: { consent: "OPTED_OUT", evidence, recordedById: session.campaign.authorizedById } });
    await transaction.outboundDispatch.updateMany({ where: { tenantId: message.tenantId, customerId, status: "QUEUED" }, data: { status: "CANCELLED", reasons: ["CUSTOMER_OPTED_OUT"], version: { increment: 1 } } });
  } else if (!human) await transaction.outreachTurn.upsert({ where: { sessionId_sourceKey: { sessionId: session.id, sourceKey: `inbound:${message.id}` } }, create: { tenantId: message.tenantId, sessionId: session.id, sourceKey: `inbound:${message.id}`, kind: "REPLY" }, update: {} });
  await recordEvent(transaction, { tenantId: message.tenantId, action: optOut ? "AI_CUSTOMER_OPTED_OUT" : human ? "AI_HUMAN_REQUESTED" : "AI_REPLY_QUEUED", entityType: "OutreachSession", entityId: session.id, metadata: { messageId: message.id }, idempotencyKey: `outreach-inbound:${message.id}` });
}
