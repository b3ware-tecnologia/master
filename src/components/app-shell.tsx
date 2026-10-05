import Link from "next/link";

export function AppShell({ children, canPlan = false }: { children: React.ReactNode; canPlan?: boolean }) {
  return <div className="shell"><aside className="sidebar"><strong>BM Crédito</strong><nav>
    <Link href="/app">Visão Geral</Link><Link href="/app/customers">Clientes</Link><Link href="/app/lists">Listas</Link><Link href="/app/imports">Importações</Link><Link href="/app/users">Usuários</Link><Link href="/app/teams">Equipes</Link><Link href="/app/audit">Auditoria</Link><Link href="/app/settings">Configurações</Link>
    {canPlan && <><Link href="/app/relationship-plans">Relacionamento</Link><Link href="/app/messaging-governance">Governança</Link><Link href="/app/conversations">Conversas WhatsApp</Link></>}
  </nav></aside><main className="content">{children}</main></div>;
}
