"use client";
import { useEffect, useState } from "react";
import type { ConversationAnalysis } from "@/domain/conversation-ai";

type State = { configured: boolean; stale: boolean; customerLinked: boolean; execution: { id: string; status: string; result: ConversationAnalysis | null; decision: { id: string } | null } | null };
const intentions: Record<string, string> = { INTEREST: "Interesse", QUESTION: "Dúvida", COMPLAINT: "Reclamação", OPT_OUT: "Pedido para parar contato", OTHER: "Outro assunto", INSUFFICIENT_CONTEXT: "Contexto insuficiente" };
export function ConversationAnalysisPanel({ tenantId, conversationId, platform }: { tenantId: string; conversationId: string; platform: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const base = `${platform ? "/api/platform/conversations" : "/api/conversations"}/${encodeURIComponent(conversationId)}/analysis`;
  const query = `?tenantId=${encodeURIComponent(tenantId)}`;
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${base}${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: State = await response.json();
        if (!controller.signal.aborted) { setState(data); setError(""); }
      } catch { if (!controller.signal.aborted) { setState(null); setError("Não foi possível consultar a análise."); } }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [base, query, refresh]);
  async function act(save = false) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}${save ? "/save" : ""}${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: save ? JSON.stringify({ executionId: state?.execution?.id }) : undefined });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Não foi possível concluir a ação.");
      setRefresh((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível concluir a ação."); }
    finally { setBusy(false); }
  }
  const execution = state?.execution;
  const running = execution?.status === "QUEUED" || execution?.status === "RUNNING";
  return <section className="conversation-analysis" aria-label="Análise da conversa">
    <h3>Análise da conversa</h3>
    <p>Resumo e sugestão de atendimento para revisão humana.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!state ? <p>Consultando disponibilidade…</p> : <>
      {!state.configured && <p role="status">IA aguardando configuração. A integração será ativada posteriormente.</p>}
      <button type="button" disabled={!state.configured || busy || running} onClick={() => void act()}>{running ? "Analisando…" : execution ? "Atualizar análise" : "Analisar conversa"}</button>
      {execution?.status === "FAILED" && <p role="status">A análise não foi concluída. Verifique a integração antes de tentar novamente.</p>}
      {execution?.status === "COMPLETED" && execution.result && <>
        <p><strong>Intenção:</strong> {intentions[execution.result.intent]}</p>
        <p>{execution.result.summary}</p>
        <p><strong>Próximo atendimento sugerido:</strong> {execution.result.nextAction}</p>
        <small>Baseada em {execution.result.evidenceMessageIds.length} mensagem(ns). Nenhuma mensagem foi enviada por esta análise.</small>
        {state.stale && <p role="status">A conversa mudou. Atualize a análise antes de salvar.</p>}
        {!state.customerLinked && <p>Este contato ainda não está vinculado a um cliente. A análise permanece na conversa.</p>}
        <div><button type="button" disabled={busy || state.stale || !state.customerLinked || !!execution.decision} onClick={() => void act(true)}>{execution.decision ? "Salva no histórico do cliente" : "Revisar e salvar no CRM"}</button></div>
      </>}
    </>}
  </section>;
}
