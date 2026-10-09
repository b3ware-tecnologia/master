import { requirePlatformAdminPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { MessagingConnectionStatus, RegisterMessagingConnection } from "@/components/messaging-connection";
export default async function PlatformPage() {
  await requirePlatformAdminPage();
  const [tenants, connections] = await Promise.all([db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }), db.messagingConnection.findMany({ include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "desc" } })]);
  return <div className="content"><h1>Administração da plataforma</h1><section className="card"><h2>Preparar WhatsApp da empresa</h2><p>Crie ou reutilize uma instância e vincule à empresa. Cada instância pertence a uma única empresa.</p><RegisterMessagingConnection tenants={tenants} /></section>{connections.length ? connections.map((connection) => <MessagingConnectionStatus key={connection.id} initial={connection} title={`WhatsApp · ${connection.tenant.name}`} canManage canProvision endpoint={`/api/platform/messaging-connections/${connection.tenantId}`} />) : <section className="card"><p>Nenhuma instância vinculada.</p></section>}</div>;
}

