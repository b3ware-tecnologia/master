import { requirePlatformAdmin } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { ConversationInbox } from "@/components/conversation-inbox";

export default async function PlatformConversationsPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  await requirePlatformAdmin();
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const requested = (await searchParams).tenantId;
  const selected = requested ? tenants.find((tenant) => tenant.id === requested) : tenants.length === 1 ? tenants[0] : undefined;
  return <div className="content"><h1>Conversas WhatsApp</h1>{selected ? <><ConversationInbox key={selected.id} tenantId={selected.id} platform /></> : <p>Selecione a empresa no menu lateral para ver as conversas.</p>}</div>;
}
