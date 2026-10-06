import { requirePlatformAdmin } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const items = [{ href: "/platform/operations", label: "Visão geral", icon: "overview" }, { href: "/platform/crm", label: "Atendimentos", icon: "list" }, { href: "/platform/ai-outreach", label: "IA de relacionamento", icon: "ai" }, { href: "/platform/conversations", label: "Conversas WhatsApp", icon: "chat" }, { href: "/platform/whatsapp-outbox", label: "Envios WhatsApp", icon: "send" }, { href: "/platform", label: "Conexões e empresas", icon: "settings" }];
  return <WorkspaceShell platform tenants={tenants} items={items}>{children}</WorkspaceShell>;
}
