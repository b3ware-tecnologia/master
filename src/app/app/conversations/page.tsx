import {resolveAuthorizationContext,requireCapability} from "@/lib/auth/context";
import {ChatWorkspace} from "@/components/chat-workspace";
export default async function Page(){const context=await resolveAuthorizationContext();requireCapability(context,"crm.read");return <ChatWorkspace tenantId={context.tenantId} canUpdate={context.capabilities.includes("crm.update")}/>;}