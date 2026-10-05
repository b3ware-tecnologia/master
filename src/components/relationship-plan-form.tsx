"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RelationshipPlanForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState<string>();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key); setBusy(true); setError("");
    try {
      const response = await fetch("/api/relationship-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId, requestKey: key, purpose: fields.get("purpose"), message: fields.get("message"), channel: fields.get("channel"), scheduledAt: new Date(String(fields.get("scheduledAt"))).toISOString() }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Não foi possível criar o plano."); if (response.status < 500) setRequestKey(undefined); }
      else { form.reset(); setRequestKey(undefined); router.refresh(); }
    } catch { setError("Falha de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="form">
    <label>Objetivo<input name="purpose" required minLength={3} maxLength={200} disabled={busy} /></label>
    <label>Canal<select name="channel" disabled={busy}><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option></select></label>
    <label>Agendamento (horário local)<input name="scheduledAt" type="datetime-local" required disabled={busy} /></label>
    <label>Texto planejado<textarea name="message" required maxLength={4000} rows={4} disabled={busy} /></label>
    <button disabled={busy} type="submit">{busy ? "Salvando…" : "Salvar rascunho"}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </form>;
}

export function RelationshipPlanActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change(action: "approve" | "cancel") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/relationship-plans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Não foi possível atualizar o plano."); else router.refresh();
    } catch { setError("Falha de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <div className="form">{status === "DRAFT" && <button disabled={busy} onClick={() => change("approve")}>Aprovar plano</button>}{status !== "CANCELLED" && <button disabled={busy} onClick={() => change("cancel")}>Cancelar plano</button>}{error && <p role="alert" className="error">{error}</p>}</div>;
}
