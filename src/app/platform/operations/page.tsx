import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { OperationsDashboard } from "@/components/operations-dashboard";
export default async function PlatformOperationsPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  await requirePlatformAdmin(); const query = await searchParams;
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }); const selected = tenants.find((item) => item.id === query.tenantId);
  return <div className="content"><Link href="/platform">← Administração da plataforma</Link><h1>Visão geral da operação</h1><form className="form" action="/platform/operations"><label>Empresa<select name="tenantId" defaultValue={selected?.id ?? ""}><option value="">Selecione</option>{tenants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button>Abrir operação</button></form>{selected && <><h2>{selected.name}</h2><OperationsDashboard key={selected.id} tenantId={selected.id} platform /></>}</div>;
}
