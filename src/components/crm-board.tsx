"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CRMCustomerPicker, type CustomerOption } from "@/components/crm-customer-picker";
import { CRMSetupPanel } from "@/components/crm-setup";
import { MessageMediaDownload } from "@/components/message-media-download";

type Assignment = { version: number; teamId: string; assignedMembershipId: string | null; team: { name: string }; assignedMembership: { user: { name: string } } | null };
type Case = { id: string; customerId: string; title: string; status: string; version: number; dueAt: string | null; customer: CustomerOption & { assignment: Assignment | null } };
type Detail = Case & { description: string | null; notes: { id: string; body: string; createdAt: string; actor: { name: string } }[]; _count: { notes: number }; conversation: { id: string; messages: { id: string; direction: string; kind: string; text: string | null; occurredAt: string }[]; _count: { messages: number } } | null };
type Directory = { id: string; name: string; consultants: { membershipId: string; name: string }[] }[];
const labels: Record<string, string> = { NEW: "Novo", IN_PROGRESS: "Em atendimento", WAITING_CUSTOMER: "Aguardando cliente", COMPLETED: "Concluído", CANCELLED: "Cancelado", OPEN: "Em aberto" };
const next: Record<string, string[]> = { NEW: ["IN_PROGRESS", "CANCELLED"], IN_PROGRESS: ["WAITING_CUSTOMER", "COMPLETED", "CANCELLED"], WAITING_CUSTOMER: ["IN_PROGRESS", "COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };
function date(value: string) { return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); }

export function CRMBoard({ tenantId, platform = false, canCreate, canDistribute, initialCaseId, initialStatus, initialDue }: { tenantId: string; platform?: boolean; canCreate: boolean; canDistribute: boolean; initialCaseId?: string; initialStatus?: string; initialDue?: string }) {
  const [list, setList] = useState<{ items: Case[]; total: number; pageSize: number } | null>(null); const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState(initialCaseId ?? ""); const [page, setPage] = useState(1); const [status, setStatus] = useState(initialStatus && labels[initialStatus] ? initialStatus : "OPEN");
  const [dueFilter, setDueFilter] = useState(initialDue && ["OVERDUE", "NEXT_24H", "UNSCHEDULED"].includes(initialDue) ? initialDue : "ALL"); const [search, setSearch] = useState(""); const [appliedSearch, setAppliedSearch] = useState("");
  const [refresh, setRefresh] = useState(0); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState<CustomerOption | null>(null); const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [note, setNote] = useState(""); const [due, setDue] = useState("");
  const [directory, setDirectory] = useState<Directory>([]); const [teamId, setTeamId] = useState(""); const [assignee, setAssignee] = useState("");
  const base = platform ? "/api/platform/crm" : "/api/crm"; const query = `?tenantId=${encodeURIComponent(tenantId)}`;
  async function mutate(path: string, method: string, body: unknown) {
    const response = await fetch(`${base}${path}${query}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação."); return result;
  }
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${base}/cases${query}&page=${page}&status=${status}&due=${dueFilter}&q=${encodeURIComponent(appliedSearch)}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error();
        const value = await response.json(); if (!controller.signal.aborted) setList(value);
      } catch { if (!controller.signal.aborted) { setList(null); setDetail(null); setError("Não foi possível consultar os atendimentos. Verifique seu acesso."); } }
    }
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [base, query, page, status, dueFilter, appliedSearch, refresh]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    async function load(initial = false) {
      try {
        const response = await fetch(`${base}/cases/${encodeURIComponent(selected)}${query}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error();
        const value: Detail = await response.json(); if (!controller.signal.aborted) { setDetail(value); if (initial) { setTeamId(value.customer.assignment?.teamId ?? ""); setAssignee(value.customer.assignment?.assignedMembershipId ?? ""); } }
      } catch { if (!controller.signal.aborted) { setDetail(null); setError("Este atendimento não está disponível para seu acesso."); } }
    }
    void load(true);
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [base, query, selected, refresh]);
  useEffect(() => {
    if (!canDistribute) return;
    const controller = new AbortController();
    void fetch(`${base}/directory${query}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(); const value = await response.json(); if (!controller.signal.aborted) setDirectory(value); }).catch(() => { if (!controller.signal.aborted) setError("Não foi possível consultar as equipes de distribuição."); });
    return () => controller.abort();
  }, [base, query, canDistribute, refresh]);
  async function act(action: string, target?: string) {
    setBusy(true); setError("");
    try {
      if (action === "create" && customer) { const created = await mutate("/cases", "POST", { requestKey: crypto.randomUUID(), customerId: customer.id, title, description }); setSelected(created.id); setTitle(""); setDescription(""); }
      else if (action === "assign" && detail) await mutate(`/customers/${detail.customerId}/assignment`, "PUT", { teamId, assignedMembershipId: assignee || null, expectedVersion: detail.customer.assignment?.version ?? null });
      else if (detail) {
        await mutate(`/cases/${detail.id}`, "PATCH", { action, requestKey: crypto.randomUUID(), expectedVersion: detail.version, ...(action === "schedule" ? { dueAt: due ? new Date(due).toISOString() : null } : { note, ...(target ? { status: target } : {}) }) });
        setNote(""); setDue("");
      }
      setRefresh((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "Falha na ação."); }
    finally { setBusy(false); }
  }
  return <>
    {canCreate && <CRMSetupPanel base={base} query={query} onChanged={() => setRefresh((value) => value + 1)} />}
    {error && <p className="error" role="alert">{error}</p>}
    {canCreate && <details className="card"><summary>Novo atendimento</summary><div className="form crm-create"><CRMCustomerPicker endpoint={`${base}/customers${query}`} value={customer} onSelect={setCustomer} /><label>Assunto<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label><label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></label><button type="button" disabled={busy || !customer || title.trim().length < 3} onClick={() => void act("create")}>Criar atendimento</button></div></details>}
    <form className="inbox-toolbar" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); setPage(1); }}><label>Etapa <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>{Object.entries(labels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label>Retorno <select value={dueFilter} onChange={(event) => { setDueFilter(event.target.value); setPage(1); }}><option value="ALL">Todos</option><option value="OVERDUE">Vencidos</option><option value="NEXT_24H">Próximas 24 horas</option><option value="UNSCHEDULED">Sem agendamento</option></select></label><label>Buscar cliente ou assunto <input maxLength={160} value={search} onChange={(event) => setSearch(event.target.value)} /></label><button type="submit">Buscar</button><button type="button" onClick={() => { setError(""); setRefresh((value) => value + 1); }}>Atualizar</button><span>{list ? `${list.total} atendimentos nesta consulta` : "Consultando…"}</span></form>
    <div className="crm-grid"><section className="card" aria-label="Fila de atendimentos"><h2>Atendimentos</h2>{list && !list.items.length ? <p>Nenhum atendimento nesta etapa.</p> : list?.items.map((item) => <button type="button" key={item.id} className={`inbox-contact ${item.id === selected ? "selected" : ""}`} onClick={() => { setSelected(item.id); setDetail(null); setError(""); setNote(""); setDue(""); }}><strong>{item.title}</strong><span>{item.customer.fullName} · {labels[item.status]}</span><span>{item.customer.assignment?.assignedMembership?.user.name || item.customer.assignment?.team.name || "Aguardando distribuição"}{item.dueAt ? ` · Retorno: ${date(item.dueAt)}` : ""}</span></button>)}{list && list.total > list.pageSize && <div className="inbox-pagination"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * list.pageSize >= list.total} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>}</section>
    <section className="card crm-detail" aria-label="Detalhes do atendimento">{!selected ? <p>Selecione um atendimento.</p> : !detail ? <p>Consultando atendimento…</p> : <><h2>{detail.title}</h2><p>{platform ? detail.customer.fullName : <Link href={`/app/customers/${detail.customerId}`}>{detail.customer.fullName}</Link>} · {labels[detail.status]}</p>{detail.description && <p>{detail.description}</p>}{detail.dueAt && <p>Retorno: {date(detail.dueAt)}</p>}
      {canDistribute && <details><summary>Distribuir cliente para equipe ou consultor</summary><div className="form"><label>Equipe<select value={teamId} onChange={(event) => { setTeamId(event.target.value); setAssignee(""); }}><option value="">Selecione</option>{directory.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Consultor<select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Fila da equipe</option>{directory.find((team) => team.id === teamId)?.consultants.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.name}</option>)}</select></label><button disabled={busy || !teamId} onClick={() => void act("assign")}>Confirmar distribuição</button></div></details>}
      {(next[detail.status] ?? []).length > 0 && <><h3>Registrar atendimento</h3><div className="form"><label>Anotação ou resultado<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></label><button disabled={busy || note.trim().length < 3} onClick={() => void act("note")}>Salvar anotação</button>{next[detail.status].map((value) => <button key={value} disabled={busy || note.trim().length < 3} onClick={() => void act("transition", value)}>{labels[value]}</button>)}</div><div className="form"><label>Próximo retorno (horário do dispositivo)<input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} /></label><button disabled={busy || !due} onClick={() => void act("schedule")}>Agendar retorno</button>{detail.dueAt && <button disabled={busy} onClick={() => { setDue(""); void (async () => { setBusy(true); try { await mutate(`/cases/${detail.id}`, "PATCH", { action: "schedule", requestKey: crypto.randomUUID(), expectedVersion: detail.version, dueAt: null }); setRefresh((value) => value + 1); } catch { setError("Não foi possível remover o agendamento."); } finally { setBusy(false); } })(); }}>Remover agendamento</button>}</div></>}
      <h3>Histórico do atendimento</h3><p>{detail.notes.length} anotações mais recentes de {detail._count.notes}.</p>{detail.notes.map((item) => <article key={item.id} className="crm-note"><small>{item.actor.name} · {date(item.createdAt)}</small><p>{item.body}</p></article>)}
      {detail.conversation && <details><summary>Mensagens da conversa vinculada ({detail.conversation._count.messages})</summary><p>Até 50 mensagens mais recentes. Downloads de imagens, áudio, vídeo MP4 e PDF de até 8 MB, enquanto disponíveis no WhatsApp.</p>{[...detail.conversation.messages].reverse().map((message) => <article key={message.id} className="crm-note"><small>{message.direction === "INBOUND" ? "Recebida" : "Enviada pelo WhatsApp"} · {date(message.occurredAt)}</small><p>{message.text ?? message.kind}</p><MessageMediaDownload kind={message.kind} endpoint={`${base}/conversations/${encodeURIComponent(detail.conversation!.id)}/messages/${encodeURIComponent(message.id)}/media${query}`} /></article>)}</details>}
    </>}</section></div>
  </>;
}
