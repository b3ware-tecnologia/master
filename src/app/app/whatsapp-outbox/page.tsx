import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { OutboundBoard } from "@/components/outbound-board";
import { redirect } from "next/navigation";
export default async function OutboxPage() {
  const context = await resolveAuthorizationContext();
  if (!context.capabilities.includes("messaging.send")) redirect("/app");
  requireCapability(context, "messaging.send");
  return <><h1>Envios WhatsApp</h1><OutboundBoard tenantId={context.tenantId} /></>;
}
