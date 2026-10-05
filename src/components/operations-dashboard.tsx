"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Overview = { tenantName: string; generatedAt: string; scope: string; counts: { activeCustomers: number; openCases: number; overdueCases: number; next24Hours: number; completedLast7Days: number; customersWaitingDistribution: number }; stages: Record<string, number>; returns: { id: string; title: string; dueAt: string; status: string; customer: { fullName: string; assignment: { team: { name: string }; assignedMembership: { user: { name: string } } | null } | null } }[] };
const stageLabels: Record<string, string> = { NEW: "Novos", IN_PROGRESS: "Em atendimento", WAITING_CUSTOMER: "Aguardando cliente" };
export function OperationsDashboard({ tenantId, platform = false }: { tenantId: string; platform?: boolean }) {
  const [data, setData] = useState<Overview | null>(null); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  const crmUrl = platform ? `/platform/crm?tenantId=${encodeURIComponent(tenantId)}` : "/app/crm";
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${platform ? "/api/platform" : "/api"}/operations?tenantId=${encodeURIComponent(tenantId)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        const value = await response.json(); if (!controller.signal.aborted) { setData(value); setError(""); }
      } catch { if (!controller.signal.aborted) { setData(null); setError("Não foi possível carregar a operação. Verifique seu acesso e atualize."); } }
    }
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [tenantId, platform, revision]);
  const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return <section aria-label="Visão da operação"><div className="inbox-toolbar"><button onClick={() => setRevision((value) => value + 1)}>Atualizar indicadores</button>{data && <span>Atualizado: {date(data.generatedAt)} · {data.scope === "ASSIGNED" ? "Meus clientes" : data.scope === "TEAM" ? "Minhas equipes" : data.tenantName}</span>}</div>{error && <p className="error" role="alert">{error}</p>}{!data && !error && <p>Consultando operação…</p>}{data && <>
    <div className="metrics-grid">{([
      ["Clientes ativos", data.counts.activeCustomers, "Clientes disponíveis no seu escopo"], ["Atendimentos abertos", data.counts.openCases, "Novos, em atendimento ou aguardando cliente"],
      ["Retornos vencidos", data.counts.overdueCases, "Atendimentos abertos com retorno atrasado"], ["Retornos nas próximas 24h", data.counts.next24Hours, "A partir do horário desta atualização"],
      ["Concluídos em 7 dias", data.counts.completedLast7Days, "Atendimentos concluídos nos últimos 7 dias"], ["Clientes sem consultor", data.counts.customersWaitingDistribution, "Sem distribuição ou na fila da equipe"],
    ] as const).map(([label, value, description]) => <article className="card metric" key={label}><h2>{label}</h2><strong>{value}</strong><p>{description}</p></article>)}</div>
    <section className="card"><h2>Fila por etapa</h2><div className="stage-links">{Object.entries(stageLabels).map(([status, label]) => <Link key={status} href={`${crmUrl}${platform ? "&" : "?"}status=${status}`}>{label}: <strong>{data.stages[status]}</strong></Link>)}<Link href={`${crmUrl}${platform ? "&" : "?"}due=OVERDUE`}>Abrir retornos vencidos →</Link></div></section>
    <section className="card"><h2>Retornos prioritários</h2><p>Até 20 retornos mais antigos, incluindo os vencidos e os agendados para as próximas 24 horas. Horários de Brasília.</p>{!data.returns.length ? <p>Nenhum retorno pendente nesse período.</p> : <div className="table-scroll"><table><thead><tr><th>Cliente / atendimento</th><th>Responsável</th><th>Retorno</th><th>Ação</th></tr></thead><tbody>{data.returns.map((item) => <tr key={item.id}><td>{item.customer.fullName}<br /><small>{item.title}</small></td><td>{item.customer.assignment?.assignedMembership?.user.name ?? item.customer.assignment?.team.name ?? "Aguardando distribuição"}</td><td>{date(item.dueAt)}{new Date(item.dueAt) < new Date(data.generatedAt) && <span className="error"> · Vencido</span>}</td><td><Link href={`${crmUrl}${platform ? "&" : "?"}caseId=${encodeURIComponent(item.id)}`}>Abrir atendimento</Link></td></tr>)}</tbody></table></div>}</section>
  </>}</section>;
}
