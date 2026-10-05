"use client";
import { useState } from "react";
import type { Role } from "@prisma/client";

const labels: Record<Role, string> = { PLATFORM_ADMIN: "Plataforma", TENANT_MASTER: "Administrador", TENANT_MANAGER: "Gestor", CONSULTANT: "Consultor" };
export function TenantSelector({ tenants, selected }: { tenants: { id: string; name: string; role: Role }[]; selected?: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function choose(id: string) {
    if (!id) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/tenant/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: id }) });
      if (!response.ok) throw new Error();
      // A full navigation discards all customer and case state from the previous tenant.
      window.location.assign("/app");
    } catch { setError("Não foi possível selecionar a empresa. Verifique seu acesso."); setBusy(false); }
  }
  return <div className="tenant-selector"><label>Empresa ativa<select aria-label="Empresa ativa" disabled={busy} value={selected ?? ""} onChange={(event) => void choose(event.target.value)}><option value="">Selecione uma empresa</option>{tenants.map((item) => <option key={item.id} value={item.id}>{item.name} · {labels[item.role]}</option>)}</select></label>{error && <p role="alert">{error}</p>}</div>;
}

export function LogoutButton() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <><button type="button" disabled={busy} onClick={() => { setBusy(true); void fetch("/api/auth/logout", { method: "POST" }).then((response) => { if (!response.ok) throw new Error(); window.location.assign("/login"); }).catch(() => { setError("Falha ao sair. Tente novamente."); setBusy(false); }); }}>Sair da conta</button>{error && <p role="alert">{error}</p>}</>;
}
