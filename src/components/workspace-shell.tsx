"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Role } from "@prisma/client";
import { TenantSelector, LogoutButton } from "@/components/tenant-selector";
import { ThemeToggle } from "@/components/theme-toggle";

export type NavigationItem = { href: string; label: string; icon: string };
function MenuIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2" /></>,
    chat: <path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4ZM8 10h8m-8 4h5" />,
    list: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8m-8 5h8m-8 5h5" /></>,
    ai: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="m20 2 1 3 3 1" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m10 3 4 0 1 3 3 1 3-1 2 4-2 2 0 3 2 2-2 4-3-1-3 1-1 3-4 0-1-3-3-1-3 1-2-4 2-2 0-3-2-2 2-4 3 1 3-1Z" transform="translate(0 -2) scale(.9)" /></>,
    send: <path d="m3 3 18 9-18 9 3-9Zm3 9h15" />,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.list}</svg>;
}
export function WorkspaceShell({ children, items, tenants = [], selectedTenant, platform = false }: { children: React.ReactNode; items: NavigationItem[]; tenants?: { id: string; name: string; role?: Role }[]; selectedTenant?: string; platform?: boolean }) {
  const pathname = usePathname(); const query = useSearchParams(); const router = useRouter(); const [open, setOpen] = useState(false);
  const tenantId = platform ? query.get("tenantId") ?? "" : selectedTenant ?? "";
  const tenant = tenants.find((item) => item.id === tenantId);
  const active = items.find((item) => pathname === item.href || (item.href !== "/app" && item.href !== "/platform" && pathname.startsWith(`${item.href}/`)));
  function switchPlatform(id: string) { const next = new URLSearchParams(); if (id) next.set("tenantId", id); router.push(`${pathname}${next.size ? `?${next}` : ""}`); router.refresh(); }
  return <div className={`shell ${open ? "menu-open" : ""}`}>
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    {open && <button className="menu-overlay" aria-label="Fechar navegação" onClick={() => setOpen(false)} />}
    <aside className="sidebar" aria-label="Navegação principal"><Link className="brand" href={platform ? "/platform" : "/app"}><span className="brand-mark">BM</span><span><strong>BM Crédito</strong><small>RELACIONAMENTO INTELIGENTE</small></span></Link>
      {platform ? <div className="tenant-selector"><label>Empresa ativa<select aria-label="Empresa ativa" value={tenantId} onChange={(event) => switchPlatform(event.target.value)}><option value="">Todas / selecione</option>{tenants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><small>Administração da plataforma</small></div> : <TenantSelector tenants={tenants as { id: string; name: string; role: Role }[]} selected={selectedTenant} />}
      <p className="nav-label">ESPAÇO DE TRABALHO</p><nav>{items.map((item) => <Link key={item.href} href={`${item.href}${platform && tenantId && item.href !== "/platform" ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`} className={active?.href === item.href ? "active" : ""} aria-current={active?.href === item.href ? "page" : undefined} onClick={() => setOpen(false)}><MenuIcon name={item.icon} />{item.label}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="side-tip"><MenuIcon name="ai" /><strong>Relacionamento com contexto</strong><p>Clientes, conversas e equipe no mesmo fluxo.</p></div><div className="account-actions"><LogoutButton /></div></div>
    </aside><div className="workspace-main"><header className="topbar"><div className="crumb"><button className="mobile-menu" aria-label="Abrir navegação" aria-expanded={open} onClick={() => setOpen(!open)}><span aria-hidden="true">☰</span></button><span>BM Crédito</span><span aria-hidden="true">/</span><b>{active?.label ?? "Área privada"}</b></div><div className="top-right"><ThemeToggle /><span className="private-badge"><span aria-hidden="true">◈</span> Acesso privado</span><span className="workspace-name">{tenant?.name ?? (platform ? "Plataforma" : "Minha empresa")}</span></div></header><main className="content" id="main-content" tabIndex={-1}>{children}</main></div>
  </div>;
}

