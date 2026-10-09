"use client";
import { useState } from "react";
import { decisionSchema, playbookInterpretationSchema, stageLabels } from "@/domain/commercial";
import { vanessaTestScenarios } from "@/domain/agent-simulation";

export function AgentSimulator({ playbooks, busy, configured, onSimulate }: {
  playbooks: { id: string; name: string; status: string }[];
  busy: boolean; configured: boolean;
  onSimulate: (input: { entityId: string; message: string; simulationStage: "INITIAL" | "REPLY" }) => Promise<void>;
}) {
  const [scenarioId, setScenarioId] = useState<string>(vanessaTestScenarios[0].id);
  const [message, setMessage] = useState("");
  const scenario = vanessaTestScenarios.find((item) => item.id === scenarioId)!;
  const approved = playbooks.filter((item) => item.status === "APPROVED");
  return <section className="panel" aria-labelledby="agent-simulator-title">
    <h2 id="agent-simulator-title">Testar a Vanessa</h2>
    <p>Teste a apresentação ou uma resposta com cliente fictício. Cada teste é independente e usa GPT-6 Luna. Nenhuma mensagem é enviada ao cliente.</p>
    {!configured && <p className="notice">A geração aguarda a configuração da OpenAI. Você pode preparar os cenários; solicitações registradas agora não serão executadas automaticamente depois.</p>}
    {!approved.length && <p className="notice">Crie e aprove uma estratégia na aba Estratégias para testar.</p>}
    <form aria-busy={busy} onSubmit={(event) => {
      event.preventDefault(); const fields = new FormData(event.currentTarget);
      void onSimulate({ entityId: String(fields.get("playbook")), simulationStage: scenario.stage, message: scenario.stage === "INITIAL" ? "" : message }).catch(() => {});
    }}>
      <label>Estratégia aprovada<select name="playbook" required disabled={busy || !approved.length}><option value="">Selecione</option>{approved.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Cenário<select value={scenarioId} disabled={busy} onChange={(event) => { const next = vanessaTestScenarios.find((item) => item.id === event.target.value)!; setScenarioId(next.id); setMessage(next.message); }}>{vanessaTestScenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {scenario.stage === "INITIAL" ? <p>Primeira abordagem: o cliente ainda não enviou nenhuma mensagem. A Vanessa inicia a conversa conforme a estratégia.</p> : <label>Mensagem do cliente fictício<textarea value={message} onChange={(event) => setMessage(event.target.value)} required maxLength={2000} rows={3} disabled={busy} /></label>}
      <p className="muted"><strong>O que observar:</strong> {scenario.expected}</p>
      <button disabled={busy || !approved.length || (scenario.stage === "REPLY" && !message.trim())}>{busy ? "Registrando…" : configured ? "Gerar teste" : "Registrar teste pendente"}</button>
    </form>
  </section>;
}

const intentLabels: Record<string, string> = { GREETING: "Apresentação", QUESTION: "Dúvida", INTEREST: "Interesse", QUALIFIED: "Necessidade identificada", BUSY: "Cliente ocupado", NOT_INTERESTED: "Sem interesse agora", OPT_OUT: "Não contatar", WRONG_NUMBER: "Número errado", HUMAN_REQUEST: "Pedido de consultor", COMPLAINT: "Reclamação", OTHER: "Outros" };
export const commercialJobLabels: Record<string, string> = { PLAYBOOK: "Interpretação da estratégia", TEST_AGENT: "Teste da Vanessa", COPILOT: "Sugestão do copiloto", WAITING_CONFIGURATION: "Aguarda configuração", QUEUED: "Na fila", RUNNING: "Gerando", COMPLETED: "Concluído", FAILED: "Não concluído" };

export function CommercialJobResult({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || !("decision" in value)) return <p>Resultado indisponível.</p>;
  const parsed = decisionSchema.safeParse(value.decision);
  if (!parsed.success) {
    const playbook = playbookInterpretationSchema.safeParse(value.decision);
    return playbook.success ? <><p>{playbook.data.understanding}</p><p>Revise os campos na aba Estratégias antes de aprovar a versão.</p></> : <p>Não foi possível apresentar este resultado.</p>;
  }
  const decision = parsed.data;
  const simulation = "simulation" in value && value.simulation === true;
  const stopping = ["OPT_OUT", "NOT_INTERESTED", "WRONG_NUMBER"].includes(decision.intent);
  return <div>
    <h3>Fala sugerida</h3><blockquote>{decision.response || "Encerrar sem nova mensagem."}</blockquote>
    <p><strong>Intenção:</strong> {intentLabels[decision.intent]} · <strong>Etapa sugerida:</strong> {stageLabels[decision.stage]}</p>
    <p><strong>Resumo:</strong> {decision.summary}</p>
    <p><strong>Próximo passo:</strong> {stopping ? "Encerrar a abordagem." : decision.handoff ? "Encaminhar à equipe." : "Continuar a conversa."} {decision.handoffReason}</p>
    {decision.followUpAt && <p><strong>Retorno sugerido:</strong> {new Date(decision.followUpAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília). {decision.followUpReason}</p>}
    <p className="muted">{simulation ? "Resultado de simulação com cliente fictício." : "Sugestão para revisão da equipe."} Nenhuma mensagem ou alteração de atendimento foi executada por esta solicitação.</p>
  </div>;
}
