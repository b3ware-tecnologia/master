"use client";
import { useEffect, useState } from "react";
import { CRMCustomerPicker, type CustomerOption } from "@/components/crm-customer-picker";
import { RelationshipPlanForm, RelationshipPlanActions } from "@/components/relationship-plan-form";
import { MessagingPolicyForm, CommunicationConsentForm, governanceReasonLabels } from "@/components/messaging-governance-form";

type Plan = { id: string; purpose: string; status: string; scheduledAt: string; customer: { fullName: string } };
type Dispatch = { id: string; planId: string; status: string; version: number; reasons: string[]; customer: { fullName: string } };
type Preview = { plan: Plan & { message: string }; recipients: { id: string; number: string }[]; selectedRecipientId: string | null; snapshotHash: string; eligible: boolean; reasons: string[]; existing: Dispatch | null };
type Detail = { id: string; status: string; version: number; recipient: string; message: string; reasons: string[]; candidates: { id: string; occurredAt: string }[] };
type Setup = { policy: { timeZone: string; startHour: number; endHour: number; minIntervalMinutes: number; enabledChannels: string[] } | null; preference: { consent: string } | null };
const statuses: Record<string, string> = { DRAFT: "Rascunho", APPROVED: "Aprovado", CANCELLED: "Cancelado", QUEUED: "Na fila", SENDING: "Envio iniciado", ACCEPTED: "Aceito pelo provedor", BLOCKED: "Bloqueado", UNCERTAIN: "Resultado incerto" };
const reasons = { ...governanceReasonLabels, OUTBOUND_DISABLED: "Envio real desativado", PROVIDER_REQUIRED: "Provedor não configurado", CONNECTION_REQUIRED: "WhatsApp da empresa não conectado", SELECT_RECIPIENT: "Selecione o número correto", OTHER_ATTEMPT_UNCONFIRMED: "Existe uma tentativa sem resultado confirmado para este cliente", UNSUPPORTED_CHANNEL: "Canal não suportado", SOURCE_CHANGED: "Os dados mudaram depois da revisão", CONNECTION_NOT_OPEN: "Conexão WhatsApp indisponível", WORKER_INTERRUPTED: "Processamento interrompido; confira a conversa", PROVIDER_OUTCOME_UNKNOWN: "O provedor pode ter recebido a mensagem; confira a conversa", ACCESS_OR_SOURCE_REVOKED: "Acesso ou dados deixaram de permitir o envio" } as Record<string, string>;
function date(value: string) { return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); }

export function OutboundBoard({ tenantId, platform = false }: { tenantId: string; platform?: boolean }) {
  const base = platform ? "/api/platform/outbound" : "/api/outbound";
  const query = `?tenantId=${encodeURIComponent(tenantId)}`;
  const [list, setList] = useState<{ enabled: boolean; plans: Plan[]; dispatches: Dispatch[] } | null>(null);
  const [selected, setSelected] = useState(""); const [recipient, setRecipient] = useState(""); const [preview, setPreview] = useState<Preview | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null); const [customer, setCustomer] = useState<CustomerOption | null>(null); const [setup, setSetup] = useState<Setup | null>(null);
  const [refresh, setRefresh] = useState(0); const [confirmed, setConfirmed] = useState(false); const [requestKey, setRequestKey] = useState<string>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const changed = () => { setConfirmed(false); setPreview(null); setRefresh((value) => value + 1); };
  async function read(path: string, signal?: AbortSignal) {
    const response = await fetch(`${base}${path}`, { cache: "no-store", signal, headers: { "x-tenant-id": tenantId } });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível consultar os dados."); return result;
  }
  useEffect(() => {
    const controller = new AbortController();
    void read(query, controller.signal).then(setList).catch((error) => { if (!controller.signal.aborted) { setList(null); setError(error.message); } });
    void read(`/setup${query}${customer ? `&customerId=${encodeURIComponent(customer.id)}` : ""}`, controller.signal).then(setSetup).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
    // Explicit refresh invalidates the review; background updates never replace the reviewed text.
  }, [base, query, customer, refresh]);
  useEffect(() => {
    setPreview(null); setConfirmed(false); setRequestKey(undefined);
    if (!selected) return;
    const controller = new AbortController();
    void read(`/preview${query}&planId=${encodeURIComponent(selected)}${recipient ? `&recipientIdentifierId=${encodeURIComponent(recipient)}` : ""}`, controller.signal).then((value) => { if (!controller.signal.aborted) setPreview(value); }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [base, query, selected, recipient, refresh]);
  async function action(path: string, body: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}${path}${query}`, { method: "POST", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) { if (response.status < 500) setRequestKey(undefined); throw new Error(result.error || "Ação indisponível."); }
      setDetail(null); changed(); setRequestKey(undefined);
    } catch (error) { setError(error instanceof Error ? error.message : "Falha de conexão. Atualize para consultar a solicitação antes de continuar."); }
    finally { setBusy(false); }
  }
  return <>
    <p>A aprovação do plano permite a revisão. O envio exige uma confirmação separada do destinatário e do texto.</p>
    {list && !list.enabled && <p role="status" className="card">Envio real desativado. Você pode preparar planos e conferir os bloqueios; nenhuma mensagem será disparada.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <button disabled={busy} onClick={() => { setError(""); setDetail(null); changed(); }}>Atualizar fila e revisão</button>
    <details className="card"><summary>Preparar plano, consentimento e política</summary>
      <CRMCustomerPicker endpoint={`${platform ? "/api/platform/crm" : "/api/crm"}/customers${query}`} value={customer} onSelect={setCustomer} />
      {customer && <><h3>Plano para {customer.fullName}</h3><RelationshipPlanForm key={customer.id} customerId={customer.id} whatsappOnly endpoint={`${base}/plans${query}`} onSaved={changed} /><h3>Consentimento</h3><p>WhatsApp: {setup?.preference?.consent === "OPTED_IN" ? "Autorizou contato" : setup?.preference?.consent === "OPTED_OUT" ? "Recusou contato" : "Não confirmado"}</p><CommunicationConsentForm customerId={customer.id} endpoint={`${base}/customers/${customer.id}/consent${query}`} onSaved={changed} /></>}
      {setup && <><h3>Política da empresa</h3><MessagingPolicyForm key={refresh} policy={setup.policy} endpoint={`${base}/policy${query}`} onSaved={changed} /></>}
    </details>
    <div className="crm-grid"><section className="card"><h2>Planos WhatsApp</h2><p>Até 50 planos mais recentes.</p>{!list ? <p>Consultando…</p> : !list.plans.length ? <p>Nenhum plano WhatsApp.</p> : list.plans.map((plan) => <button className={`inbox-contact ${plan.id === selected ? "selected" : ""}`} key={plan.id} onClick={() => { setSelected(plan.id); setRecipient(""); setError(""); }}><strong>{plan.customer.fullName}</strong><span>{plan.purpose} · {statuses[plan.status]}</span><span>{date(plan.scheduledAt)}</span></button>)}</section>
    <section className="card"><h2>Revisar destinatário e texto</h2>{!preview ? <p>{selected ? "Consultando revisão…" : "Selecione um plano."}</p> : <>
      <h3>{preview.plan.customer.fullName}</h3><p>{preview.plan.purpose} · {statuses[preview.plan.status]}</p><RelationshipPlanActions id={preview.plan.id} status={preview.plan.status} endpoint={`${base}/plans/${preview.plan.id}${query}`} onSaved={changed} />
      <label>Número WhatsApp<select value={recipient || preview.selectedRecipientId || ""} disabled={busy} onChange={(event) => setRecipient(event.target.value)}><option value="">Selecione o destinatário</option>{preview.recipients.map((item) => <option key={item.id} value={item.id}>+{item.number}</option>)}</select></label>
      <h3>Texto completo</h3><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{preview.plan.message}</p>
      {preview.reasons.length > 0 && <ul>{preview.reasons.map((reason) => <li key={reason}>{reasons[reason] || "Condição de envio indisponível"}</li>)}</ul>}
      {preview.existing ? <p>Solicitação existente: {statuses[preview.existing.status]}. Consulte o histórico abaixo.</p> : <><label><input type="checkbox" checked={confirmed} disabled={!preview.eligible || busy} onChange={(event) => setConfirmed(event.target.checked)} />Conferi o número e autorizo enviar exatamente este texto.</label><button disabled={busy || !preview.eligible || !confirmed || !preview.selectedRecipientId} onClick={() => { const key = requestKey || crypto.randomUUID(); setRequestKey(key); void action("", { requestKey: key, planId: selected, recipientIdentifierId: preview.selectedRecipientId, snapshotHash: preview.snapshotHash, confirmed: true }); }}>Confirmar e colocar na fila</button></>}
    </>}</section></div>
    <section className="card"><h2>Histórico de solicitações</h2><p>Até 50 solicitações. “Aceito pelo provedor” registra o aceite; a entrega ao destinatário ainda não é confirmada. Resultados incertos exigem conferir a conversa e não são reenviados automaticamente.</p>{list?.dispatches.map((item) => <div key={item.id} className="crm-note"><strong>{item.customer.fullName} · {statuses[item.status]}</strong><button disabled={busy} onClick={() => { setError(""); void read(`/${item.id}${query}`).then(setDetail).catch((error) => setError(error.message)); }}>Ver solicitação</button>{item.status === "QUEUED" && <button disabled={busy} onClick={() => void action(`/${item.id}/cancel`, { expectedVersion: item.version })}>Cancelar antes do início</button>}</div>)}{list && !list.dispatches.length && <p>Nenhuma solicitação registrada.</p>}
      {detail && <article><h3>{statuses[detail.status]}</h3><p>Destinatário: +{detail.recipient}</p><p style={{ whiteSpace: "pre-wrap" }}>{detail.message}</p><ul>{detail.reasons.map((reason) => <li key={reason}>{reasons[reason] || "Condição de envio indisponível"}</li>)}</ul>{detail.status === "UNCERTAIN" && <><p>Associe somente após conferir que a mensagem observada corresponde a esta tentativa. A associação registra o aceite e não envia outra mensagem.</p>{detail.candidates.map((candidate) => <button key={candidate.id} disabled={busy} onClick={() => void action(`/${detail.id}/reconcile`, { expectedVersion: detail.version, messageId: candidate.id })}>Associar mensagem observada de {date(candidate.occurredAt)}</button>)}{!detail.candidates.length && <p>Nenhuma mensagem correspondente observada. A tentativa continua incerta.</p>}</>}</article>}
    </section>
  </>;
}
