import type { ConversationMessage, Prisma } from "@prisma/client";
import { classifyExplicitContactRequest } from "@/domain/commercial";
import { recordEvent } from "@/services/events";
import { lockMessagingTarget } from "@/services/messaging-locks";

export async function registerDoNotContact(tx: Prisma.TransactionClient, tenantId: string, phone: string, reason: string, source: string, sourceMessageId?: string) {
  if (!/^[1-9]\d{9,14}$/.test(phone)) return;
  await lockMessagingTarget(tx, tenantId);
  await tx.doNotContact.upsert({ where: { tenantId_phone: { tenantId, phone } }, create: { tenantId, phone, reason, source, sourceMessageId }, update: {} });
  const ids = (await tx.customerIdentifier.findMany({ where: { tenantId, type: "PHONE", normalizedValue: phone }, select: { customerId: true } })).map((v) => v.customerId);
  await tx.communicationPreference.updateMany({ where: { tenantId, customerId: { in: ids }, channel: "WHATSAPP" }, data: { consent: "OPTED_OUT", evidence: reason } });
  await tx.outreachSession.updateMany({ where: { tenantId, customerId: { in: ids }, control: { not: "STOPPED" } }, data: { control: "STOPPED", handoffReason: "CUSTOMER_OPTED_OUT", version: { increment: 1 } } });
  await tx.outreachTurn.updateMany({ where: { tenantId, session: { customerId: { in: ids } }, status: { in: ["QUEUED", "RUNNING", "READY"] } }, data: { status: "CANCELLED", errorCode: "DO_NOT_CONTACT", lockToken: null } });
  await tx.outboundDispatch.updateMany({ where: { tenantId, OR: [{ customerId: { in: ids } }, { recipient: phone }], status: "QUEUED" }, data: { status: "CANCELLED", reasons: ["DO_NOT_CONTACT"], version: { increment: 1 } } });
  await tx.opportunityTask.updateMany({ where: { tenantId, opportunity: { customerId: { in: ids } }, status: { in: ["SCHEDULED", "PENDING_REVIEW", "QUEUED"] } }, data: { status: "CANCELLED", version: { increment: 1 } } });
  await tx.opportunity.updateMany({ where: { tenantId, customerId: { in: ids } }, data: { stage: "DO_NOT_CONTACT", lastIntent: "OPT_OUT", version: { increment: 1 } } });
  await recordEvent(tx, { tenantId, action: "DO_NOT_CONTACT_REGISTERED", entityType: "MessagingContact", entityId: sourceMessageId ?? source, metadata: { source }, idempotencyKey: sourceMessageId ? `dnc:${sourceMessageId}` : undefined });
}

export async function observeCommercialInbound(tx: Prisma.TransactionClient, message: ConversationMessage, customerId: string | null) {
  if (message.direction !== "INBOUND") return;
  const explicit = classifyExplicitContactRequest(message.text ?? "");
  if (!customerId && explicit !== "OPT_OUT") return;
  const conversation = await tx.conversation.findFirst({ where: { id: message.conversationId, tenantId: message.tenantId } });
  if (explicit === "OPT_OUT" && conversation) await registerDoNotContact(tx, message.tenantId, conversation.remoteJid.split("@")[0], "Cliente solicitou não receber novos contatos.", "WHATSAPP", message.id);
  if (!customerId) return;
  await lockMessagingTarget(tx, message.tenantId, customerId);
  const session = await tx.outreachSession.findFirst({ where: { tenantId: message.tenantId, customerId, campaign: { connectionId: message.connectionId }, OR: [{ conversationId: message.conversationId }, { conversationId: null }] }, orderBy: { createdAt: "desc" } });
  let opportunity = session ? await tx.opportunity.findUnique({ where: { sessionId: session.id } }) : await tx.opportunity.findFirst({ where: { tenantId: message.tenantId, conversationId: message.conversationId, sessionId: null } });
  const stage = explicit === "OPT_OUT" ? "DO_NOT_CONTACT" : explicit === "NOT_INTERESTED" ? "NOT_INTERESTED" : explicit === "WRONG_NUMBER" ? "LOST" : session?.control === "HUMAN" ? "HUMAN_HANDOFF" : "RESPONDED";
  if (!opportunity) opportunity = await tx.opportunity.create({ data: { tenantId: message.tenantId, customerId, conversationId: message.conversationId, campaignId: session?.campaignId, sessionId: session?.id, stage, lastIntent: explicit, lastMessageId: message.id, summary: "Interação recebida pelo WhatsApp. Consulte as mensagens para conhecer o contexto completo." } });
  else {
    const preserve = session?.control === "HUMAN" || ["WON", "LOST", "DO_NOT_CONTACT"].includes(opportunity.stage);
    await tx.opportunity.update({ where: { id: opportunity.id }, data: { lastMessageId: message.id, lastIntent: explicit, ...(explicit === "OPT_OUT" || !preserve ? { stage } : {}), version: { increment: 1 } } });
  }
  await tx.opportunityTask.updateMany({ where: { tenantId: message.tenantId, opportunityId: opportunity.id, status: { in: ["SCHEDULED", "PENDING_REVIEW", "QUEUED"] } }, data: { status: "CANCELLED", version: { increment: 1 } } });
  if (explicit === "NOT_INTERESTED" || explicit === "WRONG_NUMBER") {
    if (session) { await tx.outreachSession.update({ where: { id: session.id }, data: { control: "STOPPED", handoffReason: explicit === "WRONG_NUMBER" ? "WRONG_NUMBER" : "NOT_INTERESTED", version: { increment: 1 } } }); await tx.outreachTurn.updateMany({ where: { sessionId: session.id, status: { in: ["QUEUED", "RUNNING", "READY"] } }, data: { status: "CANCELLED", lockToken: null } }); }
    await tx.outboundDispatch.updateMany({ where: { tenantId: message.tenantId, customerId, status: "QUEUED", plan: { outreachTurn: { isNot: null } } }, data: { status: "CANCELLED", version: { increment: 1 } } });
  }
  await recordEvent(tx, { tenantId: message.tenantId, action: "OPPORTUNITY_RESPONSE_RECORDED", entityType: "Opportunity", entityId: opportunity.id, metadata: { messageId: message.id, intent: explicit, campaignId: session?.campaignId ?? null }, idempotencyKey: `opportunity-response:${message.id}` });
}

