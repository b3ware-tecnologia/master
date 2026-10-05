import { db } from "@/lib/db";
import { AuthorizationError, NotFoundError } from "@/domain/errors";
import { mediaKinds, MessageMediaUnavailable, validateMedia, type MessageMediaProvider } from "@/domain/message-media";
import { configuredEvolutionProvider } from "@/integrations/evolution-provider";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";
import { customerScope } from "@/services/customer-scope";
import { authorizeConversationActor } from "@/services/conversation-service";
import { assertTestHooksAllowed } from "@/services/test-hooks";
import { recordEvent } from "@/services/events";

export async function downloadMessageMedia(actor: CRMActor, conversationId: string, messageId: string, source: "inbox" | "crm", provider?: MessageMediaProvider) {
  assertTestHooksAllowed(!!provider);
  async function selected() { return db.$transaction(async (transaction) => {
    if (source === "inbox") await authorizeConversationActor(transaction, actor);
    else await authorizeCRMActor(transaction, actor, "crm.read");
    const conversation = await transaction.conversation.findFirst({ where: { id: conversationId, tenantId: actor.tenantId }, select: { customerId: true, remoteJid: true } });
    if (!conversation) throw new NotFoundError();
    if (source === "crm" && (!conversation.customerId || !await transaction.cRMCase.findFirst({ where: { tenantId: actor.tenantId, conversationId, customerId: conversation.customerId, customer: "context" in actor ? customerScope(actor.context) : { tenantId: actor.tenantId } } }))) throw new NotFoundError();
    const message = await transaction.conversationMessage.findFirst({ where: { id: messageId, conversationId, tenantId: actor.tenantId }, include: { connection: { select: { id: true, tenantId: true, enabled: true, instanceName: true } } } });
    if (!message) throw new NotFoundError();
    if (!message.connection.enabled || message.connection.tenantId !== actor.tenantId) throw new AuthorizationError();
    if (!(mediaKinds as readonly string[]).includes(message.kind)) throw new MessageMediaUnavailable("UNSUPPORTED_MEDIA");
    return { ...message, remoteJid: conversation.remoteJid };
  }); }
  const before = await selected();
  const media = await (provider ?? configuredEvolutionProvider()).getMessageMedia(before.connection.instanceName, { id: before.providerMessageId, remoteJid: before.remoteJid, fromMe: before.direction === "OUTBOUND" }, before.kind);
  const verified = validateMedia(before.kind, media.mimeType, media.bytes);
  const after = await selected(); // Reassignment, suspension or disabled binding during download must discard the bytes.
  if (after.connection.id !== before.connection.id || after.connection.instanceName !== before.connection.instanceName || after.providerMessageId !== before.providerMessageId || after.remoteJid !== before.remoteJid) throw new NotFoundError();
  await db.$transaction((transaction) => recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: "context" in actor ? actor.context.userId : actor.platformUserId, action: "WHATSAPP_MEDIA_DOWNLOADED", entityType: "ConversationMessage", entityId: messageId, metadata: { kind: before.kind, bytes: verified.bytes.length } }));
  return { ...verified, fileName: `whatsapp-${messageId.replace(/[^A-Za-z0-9_-]/g, "")}.${verified.extension}` };
}
