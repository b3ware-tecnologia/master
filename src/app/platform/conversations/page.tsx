import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { ConversationInbox } from "@/components/conversation-inbox";

export default async function PlatformConversationsPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  await requirePlatformAdmin();
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE", messagingConnections: { some: { enabled: true } } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const requested = (await searchParams).tenantId;
  const selected = requested ? tenants.find((tenant) => tenant.id === requested) : tenants.length === 1 ? tenants[0] : undefined;
  return <div className="content"><Link href="/platform">← Administração da plataforma</Link><h1>Conversas WhatsApp</h1><form className="form" method="get"><label>Empresa<select name="tenantId" defaultValue={selected?.id ?? ""} required><option value="">Selecione</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label><button>Abrir conversas</button></form>{selected ? <><h2>{selected.name}</h2><ConversationInbox key={selected.id} tenantId={selected.id} platform /></> : <p>Selecione uma empresa com WhatsApp vinculado.</p>}</div>;
}
