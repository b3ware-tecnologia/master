import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { CRMBoard } from "@/components/crm-board";
export default async function CRMPage({ searchParams }: { searchParams: Promise<{ caseId?: string }> }) {
  const context = await resolveAuthorizationContext(); requireCapability(context, "crm.read");
  return <><h1>{context.accessScope === "ASSIGNED" ? "Meus atendimentos" : "CRM de atendimento"}</h1><p>{context.accessScope === "TEAM" ? "Clientes distribuídos às suas equipes." : context.accessScope === "ASSIGNED" ? "Clientes atribuídos a você em uma equipe ativa." : "Atendimentos e distribuição de clientes da empresa."}</p><CRMBoard tenantId={context.tenantId} canCreate={context.capabilities.includes("crm.create")} canDistribute={context.capabilities.includes("distribution.manage")} initialCaseId={(await searchParams).caseId} /></>;
}
