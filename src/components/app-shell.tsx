import type { Capability } from "@/domain/access";
import type { Role } from "@prisma/client";
import { WorkspaceShell } from "@/components/workspace-shell";

export function AppShell({ children, capabilities = [], tenants = [], selectedTenant }: { children: React.ReactNode; capabilities?: readonly Capability[]; tenants?: { id: string; name: string; role: Role }[]; selectedTenant?: string }) {
  const items = [{ href: "/app", label: "Visão geral", icon: "overview" }, ...([
      ["crm.read", "/app/commercial", "Operação comercial"], ["crm.read", "/app/crm", "Atendimentos"], ["customers.read", "/app/customers", "Clientes"], ["lists.read", "/app/lists", "Listas"], ["lists.import", "/app/imports", "Importações"], ["users.read", "/app/users", "Usuários"], ["teams.read", "/app/teams", "Equipes"], ["audit.read", "/app/audit", "Auditoria"], ["settings.read", "/app/settings", "Configurações"], ["plans.read", "/app/relationship-plans", "Relacionamento"], ["messaging.read", "/app/messaging-governance", "Governança"], ["messaging.read", "/app/conversations", "Conversas WhatsApp"], ["messaging.send", "/app/whatsapp-outbox", "Envios WhatsApp"],
      ["plans.manage", "/app/ai-outreach", "IA de relacionamento"],
    ] as const).filter(([capability]) => capabilities.includes(capability)).map(([, href, label]) => ({ href, label, icon: href.includes("ai-outreach") ? "ai" : href.includes("conversation") ? "chat" : href.includes("users") || href.includes("teams") || href.includes("customers") ? "users" : href.includes("settings") ? "settings" : href.includes("outbox") ? "send" : "list" }))];
  return <WorkspaceShell items={items} tenants={tenants} selectedTenant={selectedTenant}>{children}</WorkspaceShell>;
}
