"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Overview = { tenantName: string; generatedAt: string; scope: string; canManageDistribution: boolean; counts: { activeCustomers: number; openCases: number; overdueCases: number; next24Hours: number; completedLast7Days: number; customersWaitingDistribution: number }; stages: Record<string, number>; returns: { id: string; title: string; dueAt: string; status: string; customer: { fullName: string; assignment: { team: { name: string }; assignedMembership: { user: { name: string } } | null } | null } }[] };
const stageLabels: Record<string, string> = { NEW: "Novos atendimentos", IN_PROGRESS: "Em atendimento", WAITING_CUSTOMER: "Aguardando o cliente" };
function Arrow() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>; }
export function OperationsDashboard({ tenantId, platform = false }: { tenantId: string; platform?: boolean }) {
  const [data, setData] = useState<Overview | null>(null); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  const crmUrl = platform ? "/platform/crm?tenantId=" + encodeURIComponent(tenantId) : "/app/crm";
  const separator = platform ? "&" : "?";
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch((platform ? "/api/platform" : "/api") + "/operations?tenantId=" + encodeURIComponent(tenantId), { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(); const value = await response.json();
        if (!controller.signal.aborted) { setData(value); setError(""); }
      } catch { if (!controller.signal.aborted) setError("Não foi possível atualizar. Verifique seu acesso e tente novamente."); }
    }
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [tenantId, platform, revision]);
  const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const largest = Math.max(1, ...Object.values(data?.stages ?? {}));
  return <section aria-label="Visão da operação">
    <header className="page-header overview-header"><div><span className="eyebrow">VISÃO GERAL · {data?.scope === "ASSIGNED" ? "MINHA CARTEIRA" : data?.scope === "TEAM" ? "MINHAS EQUIPES" : "OPERAÇÃO"}</span><h1>Seu próximo passo começa aqui.</h1><p>{data?.tenantName ?? "Seu espaço de trabalho"} · Clientes, conversas e equipe em sintonia.</p></div><button onClick={() => setRevision((value) => value + 1)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" /></svg>Atualizar</button></header>
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <div className="metrics-grid skeleton-grid" role="status" aria-label="Carregando indicadores">{Array.from({ length: 6 }, (_, i) => <div className="card skeleton-card" aria-hidden="true" key={i}><div /><div /><div /></div>)}</div>}
    {data && <>
      <div className="metrics-grid">{([
        ["Contatos na base", data.counts.activeCustomers, "Cadastros ativos no seu escopo. Não implica oportunidade.", "Cadastro"],
        ["Atendimentos abertos", data.counts.openCases, "Novos, em andamento ou aguardando resposta.", "Atendimento"],
        ["Retornos vencidos", data.counts.overdueCases, "Conversas que precisam da sua atenção.", data.counts.overdueCases ? "Atenção" : "Em dia"],
        ["Retornos nas próximas 24h", data.counts.next24Hours, "Agenda a partir desta atualização.", "Agenda"],
        ["Concluídos em 7 dias", data.counts.completedLast7Days, "Atendimentos encerrados nos últimos sete dias.", "Histórico"],
        ["Contatos sem consultor", data.counts.customersWaitingDistribution, "Cadastros sem responsável ou na fila da equipe.", "Distribuição"],
      ] as const).map(([label, value, description, badge], index) => <article className={"card metric" + (index === 2 && value ? " metric-alert" : "")} key={label}><div className="metric-top"><h2>{label}</h2><span className={"status-badge" + (index === 2 && value ? " pending" : "")}>{badge}</span></div><strong>{value.toLocaleString("pt-BR")}</strong><p>{description}</p></article>)}</div>
      <div className="overview-grid"><section className="card"><div className="section-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Cada conversa tem um próximo passo</h2></div><span className="status-badge">{data.counts.openCases} em aberto</span></div><div className="stage-overview">{Object.entries(stageLabels).map(([status, label], index) => <Link key={status} href={crmUrl + separator + "status=" + status} className="stage-row"><div><span className="stage-dot" data-stage={index} /><span>{label}</span><strong>{data.stages[status]}</strong><Arrow /></div><div className="stage-track" aria-hidden="true"><span data-stage={index} style={{ width: (100 * data.stages[status] / largest) + "%" }} /></div></Link>)}</div><p className="muted">Distribuição dos atendimentos abertos por etapa.</p></section>
      <section className="card next-steps"><span className="eyebrow">PARA AGORA</span><h2>Vamos continuar?</h2><Link href={crmUrl + separator + "due=OVERDUE"}><span><strong>Priorizar retornos</strong><small>{data.counts.overdueCases ? data.counts.overdueCases + " atendimentos com retorno vencido" : "Nenhum retorno vencido neste momento"}</small></span><Arrow /></Link><Link href={crmUrl}><span><strong>{data.canManageDistribution ? "Organizar os atendimentos" : "Continuar atendimentos"}</strong><small>{data.canManageDistribution ? "Acompanhe a equipe e distribua os clientes" : "Abra a sua fila e acompanhe cada cliente"}</small></span><Arrow /></Link><Link href={(platform ? "/platform" : "/app") + "/commercial" + (platform ? "?tenantId=" + encodeURIComponent(tenantId) : "")}><span><strong>Ver oportunidades</strong><small>Acompanhe a evolução das conversas comerciais</small></span><Arrow /></Link></section></div>
      <section className="card"><div className="section-heading"><div><span className="eyebrow">AGENDA DA OPERAÇÃO</span><h2>Retornos prioritários</h2></div><Link className="text-link" href={crmUrl + separator + "due=NEXT_24H"}>Ver agenda <Arrow /></Link></div><p className="muted">Até 20 retornos mais antigos, vencidos ou previstos para as próximas 24 horas. Horários de Brasília.</p>{!data.returns.length ? <div className="empty-state"><span className="empty-mark" aria-hidden="true">✓</span><strong>Tudo em dia por aqui.</strong><p>Os próximos retornos aparecerão nesta área quando forem agendados.</p><Link href={crmUrl}>Abrir atendimentos <Arrow /></Link></div> : <div className="table-scroll"><table><thead><tr><th>Cliente e atendimento</th><th>Responsável</th><th>Retorno</th><th /></tr></thead><tbody>{data.returns.map((item) => <tr key={item.id}><td><strong>{item.customer.fullName}</strong><br /><small>{item.title}</small></td><td>{item.customer.assignment?.assignedMembership?.user.name ?? item.customer.assignment?.team.name ?? "Aguardando distribuição"}</td><td>{date(item.dueAt)}{new Date(item.dueAt) < new Date(data.generatedAt) && <span className="status-badge pending">Vencido</span>}</td><td><Link className="text-link" href={crmUrl + separator + "caseId=" + encodeURIComponent(item.id)}>Abrir <Arrow /></Link></td></tr>)}</tbody></table></div>}</section>
      <p className="last-updated">Atualizado em {date(data.generatedAt)} · {data.scope === "ASSIGNED" ? "Minha carteira" : data.scope === "TEAM" ? "Minhas equipes" : data.tenantName}</p>
    </>}
  </section>;
}
