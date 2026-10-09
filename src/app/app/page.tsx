import { resolveAuthorizationContext } from "@/lib/auth/context";
import { OperationsDashboard } from "@/components/operations-dashboard";
export default async function OverviewPage() { const context = await resolveAuthorizationContext(); return <OperationsDashboard tenantId={context.tenantId} />; }
