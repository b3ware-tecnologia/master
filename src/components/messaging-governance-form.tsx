"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Policy = { timeZone: string; startHour: number; endHour: number; minIntervalMinutes: number; enabledChannels: string[] };
export function MessagingPolicyForm({ policy, endpoint = "/api/messaging-policy", onSaved }: { policy: Policy | null; endpoint?: string; onSaved?: () => void }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeZone: form.get("timeZone"), startHour: Number(form.get("startHour")), endHour: Number(form.get("endHour")), minIntervalMinutes: Number(form.get("minIntervalMinutes")), enabledChannels: form.getAll("enabledChannels") }) });
      const result = await response.json(); if (!response.ok) setError(result.error ?? "Não foi possível salvar."); else if (onSaved) onSaved(); else router.refresh();
    } catch { setError("Falha de conexão. Tente novamente."); } finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}><label>Fuso horário<input name="timeZone" defaultValue={policy?.timeZone ?? "America/Sao_Paulo"} required disabled={busy} /></label><label>Início (hora)<input type="number" name="startHour" min={0} max={23} defaultValue={policy?.startHour ?? 9} required disabled={busy} /></label><label>Fim (hora)<input type="number" name="endHour" min={1} max={24} defaultValue={policy?.endHour ?? 18} required disabled={busy} /></label><label>Intervalo mínimo (minutos)<input type="number" name="minIntervalMinutes" min={0} max={10080} defaultValue={policy?.minIntervalMinutes ?? 1440} required disabled={busy} /></label><fieldset><legend>Canais habilitados</legend>{["WHATSAPP", "EMAIL", "PHONE"].map((channel) => <label key={channel}><input type="checkbox" name="enabledChannels" value={channel} defaultChecked={policy?.enabledChannels.includes(channel) ?? false} disabled={busy} />{channel === "WHATSAPP" ? "WhatsApp" : channel === "EMAIL" ? "E-mail" : "Telefone"}</label>)}</fieldset><button disabled={busy}>Salvar política</button>{error && <p role="alert" className="error">{error}</p>}</form>;
}

export function CommunicationConsentForm({ customerId, endpoint, onSaved }: { customerId: string; endpoint?: string; onSaved?: () => void }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element); setBusy(true); setError("");
    try {
      const response = await fetch(endpoint ?? `/api/customers/${customerId}/communication-preferences`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: form.get("channel"), consent: form.get("consent"), evidence: form.get("evidence") }) });
      const result = await response.json(); if (!response.ok) setError(result.error ?? "Não foi possível registrar."); else { element.reset(); if (onSaved) onSaved(); else router.refresh(); }
    } catch { setError("Falha de conexão. Tente novamente."); } finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}><label>Canal<select name="channel" disabled={busy}><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option></select></label><label>Preferência<select name="consent" disabled={busy}><option value="UNKNOWN">Não confirmado</option><option value="OPTED_IN">Autorizou contato</option><option value="OPTED_OUT">Recusou contato</option></select></label><label>Origem e referência da autorização ou recusa<textarea name="evidence" minLength={10} maxLength={1000} required rows={3} disabled={busy} /></label><button disabled={busy}>Registrar preferência</button>{error && <p role="alert" className="error">{error}</p>}</form>;
}

export const governanceReasonLabels: Record<string, string> = { PLAN_NOT_APPROVED: "Plano sem aprovação", CUSTOMER_INACTIVE: "Cliente inativo", RECIPIENT_MISSING: "Identificador válido do canal ausente", CUSTOMER_OPTED_OUT: "Cliente recusou contato", CONSENT_REQUIRED: "Autorização do cliente pendente", NOT_DUE: "Agendamento ainda não chegou", POLICY_REQUIRED: "Política da empresa pendente", CHANNEL_DISABLED: "Canal desabilitado", OUTSIDE_CONTACT_WINDOW: "Fora da janela de contato", CONTACT_COOLDOWN: "Intervalo entre contatos ainda não cumprido" };
export function GovernanceCheckButton({ planId }: { planId: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<{ eligible: boolean; reasons: string[] }>();
  async function check() { setBusy(true); setError(""); setResult(undefined); try { const response = await fetch(`/api/relationship-plans/${planId}/governance`, { method: "POST" }); const payload = await response.json(); if (!response.ok) setError(payload.error ?? "Não foi possível verificar."); else setResult(payload); } catch { setError("Falha de conexão. Tente novamente."); } finally { setBusy(false); } }
  return <div><button onClick={check} disabled={busy}>{busy ? "Verificando…" : "Verificar governança"}</button>{error && <p role="alert" className="error">{error}</p>}{result && <div role="status"><p>{result.eligible ? "Elegível neste instante. O envio depende da conexão do canal e de uma nova verificação." : "Contato bloqueado:"}</p>{result.reasons.length > 0 && <ul>{result.reasons.map((reason) => <li key={reason}>{governanceReasonLabels[reason] ?? reason}</li>)}</ul>}</div>}</div>;
}
