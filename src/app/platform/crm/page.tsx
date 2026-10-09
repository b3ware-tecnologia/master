import { requirePlatformAdminPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { CRMBoard } from "@/components/crm-board";
export default async function PlatformCRMPage({ searchParams }: { searchParams: Promise<{ tenantId?: string; caseId?: string; status?: string; due?: string }> }) {
  await requirePlatformAdminPage(); const query = await searchParams;
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const selected = tenants.find((tenant) => tenant.id === query.tenantId);
  return <div className="content"><h1>CRM de atendimento</h1>{!selected && <section className="card"><p>Selecione a empresa no menu lateral para abrir esta área.</p></section>}{selected && <><CRMBoard key={selected.id} tenantId={selected.id} platform canCreate canDistribute initialCaseId={query.caseId} initialStatus={query.status} initialDue={query.due} /></>}</div>;
}

