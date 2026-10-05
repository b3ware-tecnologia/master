import Link from "next/link";
import type { Capability } from "@/domain/access";

export function AppShell({ children, capabilities = [] }: { children: React.ReactNode; capabilities?: readonly Capability[] }) {
  return <div className="shell"><aside className="sidebar"><strong>BM Crédito</strong><nav>
    <Link href="/app">Visão Geral</Link>{([
      ["crm.read", "/app/crm", "Atendimentos"], ["customers.read", "/app/customers", "Clientes"], ["lists.read", "/app/lists", "Listas"], ["lists.import", "/app/imports", "Importações"], ["users.read", "/app/users", "Usuários"], ["teams.read", "/app/teams", "Equipes"], ["audit.read", "/app/audit", "Auditoria"], ["settings.read", "/app/settings", "Configurações"], ["plans.read", "/app/relationship-plans", "Relacionamento"], ["messaging.read", "/app/messaging-governance", "Governança"], ["messaging.read", "/app/conversations", "Conversas WhatsApp"], ["messaging.send", "/app/whatsapp-outbox", "Envios WhatsApp"],
    ] as const).filter(([capability]) => capabilities.includes(capability)).map(([capability, href, label]) => <Link key={`${capability}:${href}`} href={href}>{label}</Link>)}
  </nav></aside><main className="content">{children}</main></div>;
}
