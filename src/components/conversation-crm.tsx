"use client";
import { useRef, useState } from "react";
import { CRMCustomerPicker, type CustomerOption } from "@/components/crm-customer-picker";

export function ConversationCRM({ tenantId, conversationId, customer, platform, onLinked }: { tenantId: string; conversationId: string; customer: CustomerOption | null; platform: boolean; onLinked: () => void }) {
  const [selected, setSelected] = useState<CustomerOption | null>(null); const [name, setName] = useState(""); const [title, setTitle] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const customerRequest = useRef<string | null>(null);
  const base = platform ? "/api/platform" : "/api"; const query = `?tenantId=${encodeURIComponent(tenantId)}`;
  async function request(path: string, method: string, body: unknown) {
    const response = await fetch(`${base}${path}${query}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação."); return result;
  }
  async function act(action: "create-customer" | "link" | "case") {
    setBusy(true); setError("");
    try {
      if (action === "create-customer") { customerRequest.current ??= crypto.randomUUID(); const created = await request("/crm/customers", "POST", { requestKey: customerRequest.current, fullName: name }); setSelected(created); setName(""); customerRequest.current = null; }
      if (action === "link" && selected) { await request(`/conversations/${encodeURIComponent(conversationId)}/customer`, "PUT", { customerId: selected.id }); onLinked(); }
      if (action === "case" && customer) {
        const created = await request("/crm/cases", "POST", { requestKey: crypto.randomUUID(), customerId: customer.id, conversationId, title });
        window.location.assign(`${platform ? "/platform/crm" : "/app/crm"}?tenantId=${encodeURIComponent(tenantId)}&caseId=${encodeURIComponent(created.id)}`);
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Falha na ação."); }
    finally { setBusy(false); }
  }
  return <section className="conversation-analysis"><h3>Atendimento no CRM</h3>{error && <p className="error" role="alert">{error}</p>}{!customer ? <>
    <p>Associe a conversa ao cadastro correto antes de abrir um atendimento.</p>
    <CRMCustomerPicker endpoint={`${base}/crm/customers${query}`} value={selected} onSelect={setSelected} />
    <button type="button" disabled={busy || !selected} onClick={() => void act("link")}>Confirmar vínculo com o cliente</button>
    <details><summary>Cadastrar um novo cliente</summary><div className="form"><label>Nome completo confirmado<input value={name} onChange={(event) => { setName(event.target.value); customerRequest.current = null; }} maxLength={200} /></label><button type="button" disabled={busy || name.trim().length < 2} onClick={() => void act("create-customer")}>Cadastrar cliente</button></div></details>
  </> : <div className="form"><label>Assunto do atendimento<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Descreva o atendimento necessário" /></label><button type="button" disabled={busy || title.trim().length < 3} onClick={() => void act("case")}>Abrir atendimento no CRM</button></div>}</section>;
}
