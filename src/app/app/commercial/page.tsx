import { CommercialWorkspace } from "@/components/commercial-workspace";
import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
export default async function CommercialPage() { const context = await resolveAuthorizationContext(); requireCapability(context,"crm.read"); return <CommercialWorkspace tenantId={context.tenantId} />; }
