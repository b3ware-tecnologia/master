import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { OutboundBoard } from "@/components/outbound-board";
export default async function PlatformOutboxPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  await requirePlatformAdmin(); const query = await searchParams;
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const selected = tenants.find((tenant) => tenant.id === query.tenantId);
  return <main className="content"><Link href="/platform">← Administração da plataforma</Link><h1>Envios WhatsApp</h1><form className="form" action="/platform/whatsapp-outbox"><label>Empresa<select name="tenantId" defaultValue={selected?.id ?? ""}><option value="">Selecione</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label><button>Abrir envios</button></form>{selected && <><h2>{selected.name}</h2><OutboundBoard key={selected.id} tenantId={selected.id} platform /></>}</main>;
}
