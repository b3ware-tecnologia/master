"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export function RegisterMessagingConnection({ tenants }: { tenants: { id: string; name: string }[] }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); try { const response = await fetch("/api/platform/messaging-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: form.get("tenantId"), instanceName: form.get("instanceName") }) }); const result = await response.json(); if (!response.ok) setError(result.error ?? "Não foi possível preparar a instância."); router.refresh(); } catch { setError("Falha de conexão. Tente novamente."); } finally { setBusy(false); } }
  return <form className="form" onSubmit={submit}><label>Empresa<select name="tenantId" required disabled={busy}><option value="">Selecione</option>{tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select></label><label>Nome da instância<input name="instanceName" required pattern="[A-Za-z0-9_-]{1,80}" maxLength={80} placeholder="bm_credito_staging" disabled={busy} /></label><button disabled={busy || tenants.length === 0}>{busy ? "Preparando…" : "Preparar e vincular"}</button>{error && <p className="error" role="alert">{error}</p>}</form>;
}
type Connection = { id?: string; instanceName: string; enabled?: boolean; lastState: string; lastErrorCode: string | null; lastCheckedAt: Date | string | null; isDefault?: boolean; healthStatus?: string; circuitState?: string };
type Metrics = { receipts: Record<string, number>; deliveries: Record<string, number>; latencySamples: number; latencyP95Ms: number | null; deadLetters: { id: string; errorCode: string; attempts: number }[] };
const states: Record<string, string> = { OPEN: "Conectada", CONNECTING: "Conectando", CLOSED: "Desconectada", UNCHECKED: "Ainda não verificada", DISABLED: "Desabilitada", ERROR: "Verificação indisponível" };
export function MessagingConnectionStatus({ initial, endpoint = "/api/messaging-connection", canManage = false, canProvision = false, title = "Conexão WhatsApp" }: { initial: Connection | null; endpoint?: string; canManage?: boolean; canProvision?: boolean; title?: string }) {
  const [connection, setConnection] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const target = `${endpoint}${initial?.id ? `?connectionId=${encodeURIComponent(initial.id)}` : ""}`;
  async function control(action: string, receiptId?: string) { setBusy(true); setError(""); try { const response = await fetch(target, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, receiptId }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error); setConnection(value); setMetrics(null); } catch (error) { setError(error instanceof Error ? error.message : "Ação indisponível."); } finally { setBusy(false); } }
  async function loadMetrics() { setBusy(true); setError(""); try { const response = await fetch(target, { method: "PUT", cache: "no-store" }); const value = await response.json(); if (!response.ok) throw new Error(value.error); setMetrics(value); } catch (error) { setError(error instanceof Error ? error.message : "Consulta indisponível."); } finally { setBusy(false); } }
  useEffect(() => {
    if (!qrCode) return;
    const controller = new AbortController();
    // This is the UI display window, not a claimed provider QR expiry time.
    const timer = setTimeout(() => setQrCode(null), 20_000);
    const poll = setInterval(async () => {
      try {
        const response = await fetch(target, { method: "POST", signal: controller.signal, cache: "no-store" });
        if (response.ok) { const updated: Connection = await response.json(); setConnection(updated); if (updated.lastState === "OPEN") setQrCode(null); }
      } catch { /* The explicit check button reports network failures. */ }
    }, 5_000);
    return () => { clearTimeout(timer); clearInterval(poll); controller.abort(); };
  }, [qrCode, target]);
  async function operate(action: "check" | "pair" | "provision" | "webhook") {
    setBusy(true); setError(""); setQrCode(null);
    try {
      const response = await fetch(`${action === "check" ? endpoint : `${endpoint}/${action}`}${initial?.id ? `?connectionId=${encodeURIComponent(initial.id)}` : ""}`, { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Não foi possível completar a operação.");
      else if (action === "pair") { setConnection(result.connection); setQrCode(result.qrCode); if (!result.qrCode && result.connection.lastState !== "OPEN") setError("QR Code ainda não disponível. Aguarde alguns segundos e tente novamente."); }
      else setConnection(result);
    } catch { setError("Falha de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <section className="card"><h2>{title}</h2>{connection ? <>
    <p aria-live="polite">Instância: {connection.instanceName} · {states[connection.lastState] ?? "Estado desconhecido"}</p>
    <p>{connection.isDefault ? "Conexão principal" : "Conexão adicional"}{connection.healthStatus && ` · Saúde: ${connection.healthStatus === "HEALTHY" ? "Disponível" : connection.healthStatus === "UNCHECKED" ? "Aguardando verificação" : "Indisponível"}`}{connection.circuitState === "OPEN" && " · Envios pausados para recuperação"}</p>
    {connection.lastCheckedAt && <p>Última verificação: {new Date(connection.lastCheckedAt).toLocaleString("pt-BR")}</p>}
    {initial?.id && <><button className="secondary" disabled={busy} onClick={() => void loadMetrics()}>Consultar fila e entregas</button>{canManage && <div className="inbox-toolbar">{!connection.isDefault && <button className="secondary" disabled={busy} onClick={() => void control("default")}>Tornar principal</button>}<button className="secondary" disabled={busy} onClick={() => void control(connection.enabled === false ? "enable" : "disable")}>{connection.enabled === false ? "Habilitar conexão" : "Desabilitar conexão"}</button></div>}</>}
    {metrics && <div><p>Na fila: {metrics.receipts.QUEUED ?? 0} · Processando: {metrics.receipts.PROCESSING ?? 0} · Processados: {metrics.receipts.PROCESSED ?? 0} · Falhas: {metrics.receipts.DEAD_LETTER ?? 0}</p><p>Entregues: {metrics.deliveries.DELIVERED ?? 0} · Lidas: {metrics.deliveries.READ ?? 0} · Falhas de entrega: {metrics.deliveries.FAILED ?? 0}</p><p>{metrics.latencyP95Ms === null ? "Sem amostra de latência." : `95% dos últimos ${metrics.latencySamples} recebimentos processados em até ${(metrics.latencyP95Ms / 1000).toFixed(1)} s.`}</p>{canManage && metrics.deadLetters.map((item) => <p key={item.id}>Recebimento com falha após {item.attempts} tentativas <button disabled={busy || connection.enabled === false} onClick={() => void control("retry-receipt", item.id)}>Reprocessar recebimento</button></p>)}</div>}
    {connection.lastErrorCode === "NOT_CONFIGURED" && <p>A configuração segura do provedor está pendente.</p>}
    {canManage && <div className="form"><button disabled={busy} onClick={() => operate("check")}>Verificar conexão</button>{connection.lastState !== "OPEN" && <button disabled={busy} onClick={() => operate("pair")}>{busy ? "Aguarde…" : "Gerar QR Code"}</button>}{canProvision && <><button disabled={busy} onClick={() => operate("provision")}>Preparar instância</button><button disabled={busy} onClick={() => operate("webhook")}>Ativar recebimento</button></>}</div>}
    {qrCode && <div className="pairing-qr"><Image src={qrCode} alt="QR Code para conectar o WhatsApp desta empresa" width={256} height={256} unoptimized /><p>No WhatsApp do número da empresa, abra <strong>Aparelhos conectados → Conectar aparelho</strong> e escaneie este código.</p><p>O código é exibido por 20 segundos. Se expirar, clique em Gerar QR Code novamente.</p></div>}
  </> : <p>Nenhuma instância vinculada. O administrador da plataforma deve preparar a instância desta empresa.</p>}{error && <p className="error" role="alert">{error}</p>}<p>O pareamento conecta o número. Os planos continuam sujeitos à aprovação e à governança.</p></section>;
}
