import { resolveAuthorizationContext } from "@/lib/auth/context";
import { OperationsDashboard } from "@/components/operations-dashboard";
export default async function OverviewPage() { const context = await resolveAuthorizationContext(); return <><h1>Visão geral da operação</h1><OperationsDashboard tenantId={context.tenantId} /></>; }
