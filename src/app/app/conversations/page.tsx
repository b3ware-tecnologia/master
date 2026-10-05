import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { ConversationInbox } from "@/components/conversation-inbox";
export default async function ConversationsPage() {
  const context = await resolveAuthorizationContext();
  requireCapability(context, "messaging.read");
  return <><h1>Conversas WhatsApp</h1><ConversationInbox tenantId={context.tenantId} /></>;
}
