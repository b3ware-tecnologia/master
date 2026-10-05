import { requirePlatformAdmin } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { RegisterMessagingConnection } from "@/components/messaging-connection";
export default async function PlatformPage() {
  await requirePlatformAdmin();
  const [tenants, connections] = await Promise.all([db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }), db.messagingConnection.findMany({ include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "desc" } })]);
  return <main className="content"><h1>Administração da plataforma</h1><section className="card"><h2>Vincular uma instância WhatsApp à empresa</h2><p>Registre uma instância Evolution existente. Cada instância pertence a uma única empresa.</p><RegisterMessagingConnection tenants={tenants} /></section><section className="card"><h2>Vínculos registrados</h2>{connections.length ? connections.map((connection) => <p key={connection.id}>{connection.tenant.name} · {connection.instanceName}</p>) : <p>Nenhuma instância vinculada.</p>}</section></main>;
}
