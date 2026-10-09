import { requirePlatformAdminPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { OperationsDashboard } from "@/components/operations-dashboard";
export default async function PlatformOperationsPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  await requirePlatformAdminPage(); const query = await searchParams;
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }); const selected = tenants.find((item) => item.id === query.tenantId);
  return <div className="content">{!selected && <section className="card"><p>Selecione a empresa no menu lateral para abrir esta área.</p></section>}{selected && <><OperationsDashboard key={selected.id} tenantId={selected.id} platform /></>}</div>;
}


