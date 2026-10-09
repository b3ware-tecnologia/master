import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { CRMBoard } from "@/components/crm-board";
export default async function CRMPage({ searchParams }: { searchParams: Promise<{ caseId?: string; status?: string; due?: string }> }) {
  const context = await resolveAuthorizationContext(); requireCapability(context, "crm.read"); const query = await searchParams;
  return <><h1>{context.accessScope === "ASSIGNED" ? "Meus atendimentos" : "CRM de atendimento"}</h1><p>{context.accessScope === "TEAM" ? "Clientes distribuídos às suas equipes." : context.accessScope === "ASSIGNED" ? "Clientes atribuídos a você em uma equipe ativa." : "Atendimentos e distribuição de clientes da empresa."}</p><CRMBoard tenantId={context.tenantId} canUpdate={context.capabilities.includes("crm.update")} canCreate={context.capabilities.includes("crm.create")} canDistribute={context.capabilities.includes("distribution.manage")} initialCaseId={query.caseId} initialStatus={query.status} initialDue={query.due} /></>;
}

