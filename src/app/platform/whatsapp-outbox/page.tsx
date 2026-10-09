import { requirePlatformAdminPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { OutboundBoard } from "@/components/outbound-board";
export default async function PlatformOutboxPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  await requirePlatformAdminPage(); const query = await searchParams;
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const selected = tenants.find((tenant) => tenant.id === query.tenantId);
  return <div className="content"><h1>Envios WhatsApp</h1>{!selected && <section className="card"><p>Selecione a empresa no menu lateral para abrir esta área.</p></section>}{selected && <><OutboundBoard key={selected.id} tenantId={selected.id} platform /></>}</div>;
}

