import { requirePlatformAdmin } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { OperationsDashboard } from "@/components/operations-dashboard";
export default async function PlatformOperationsPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  await requirePlatformAdmin(); const query = await searchParams;
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }); const selected = tenants.find((item) => item.id === query.tenantId);
  return <div className="content"><h1>Visão geral da operação</h1>{!selected && <section className="card"><p>Selecione a empresa no menu lateral para abrir esta área.</p></section>}{selected && <><OperationsDashboard key={selected.id} tenantId={selected.id} platform /></>}</div>;
}
