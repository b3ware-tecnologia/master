"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ConversationAnalysisPanel } from "@/components/conversation-analysis";
import { MessageMediaDownload } from "@/components/message-media-download";
import { ConversationCRM } from "@/components/conversation-crm";

type Conversation = { id: string; remoteJid: string; displayName: string | null; lastMessageAt?: string; customer: { id: string; fullName: string } | null; _count?: { messages: number } };
type ConversationList = { items: Conversation[]; total: number; pageSize: number };
type MessageList = { conversation: Conversation; items: { id: string; direction: "INBOUND" | "OUTBOUND"; kind: string; text: string | null; occurredAt: string; deliveryState: string; deliveredAt: string | null; readAt: string | null }[]; total: number; pageSize: number };
const kindNames: Record<string, string> = { IMAGE: "Imagem", AUDIO: "Áudio", VIDEO: "Vídeo", DOCUMENT: "Documento", OTHER: "Outro tipo de mensagem" };
function contact(item: Conversation) { return item.customer?.fullName || item.displayName || (item.remoteJid.endsWith("@lid") ? "Contato WhatsApp" : `+${item.remoteJid.split("@")[0]}`); }
function date(value: string) { return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); }

export function ConversationInbox({ tenantId, platform = false }: { tenantId: string; platform?: boolean }) {
  const [list, setList] = useState<ConversationList | null>(null);
  const [messages, setMessages] = useState<MessageList | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [messagePage, setMessagePage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [listError, setListError] = useState("");
  const [messageError, setMessageError] = useState("");
  const prefix = platform ? "/api/platform/conversations" : "/api/conversations";
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${prefix}?tenantId=${encodeURIComponent(tenantId)}&page=${listPage}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const value: ConversationList = await response.json();
        if (!controller.signal.aborted) { setList(value); setListError(""); }
      } catch { if (!controller.signal.aborted) { setList(null); setListError("Não foi possível atualizar as conversas. Verifique seu acesso e tente novamente."); } }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [tenantId, prefix, listPage, refresh]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${prefix}/${encodeURIComponent(selected)}?tenantId=${encodeURIComponent(tenantId)}&page=${messagePage}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const value: MessageList = await response.json();
        if (!controller.signal.aborted) { setMessages(value); setMessageError(""); }
      } catch { if (!controller.signal.aborted) { setMessages(null); setMessageError("Não foi possível carregar esta conversa."); } }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [tenantId, prefix, selected, messagePage, refresh]);
  return <>
    <div className="inbox-toolbar"><p>Mensagens recebidas a partir da ativação do recebimento. Atualização a cada 10 segundos.</p><button type="button" onClick={() => setRefresh((value) => value + 1)}>Atualizar</button></div>
    <div className="inbox-grid"><section className="card inbox-contacts" aria-label="Conversas">
      <h2>Conversas{list ? ` (${list.total})` : ""}</h2>
      {listError ? <p className="error" role="alert">{listError}</p> : !list ? <p>Carregando…</p> : !list.items.length ? <p>Nenhuma mensagem recebida ainda.</p> : list.items.map((item) => <button type="button" key={item.id} className={`inbox-contact ${selected === item.id ? "selected" : ""}`} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setMessages(null); setMessageError(""); setMessagePage(1); }}><strong>{contact(item)}</strong><span>{item.lastMessageAt ? date(item.lastMessageAt) : ""} · {item._count?.messages ?? 0} mensagens</span></button>)}
      {list && list.total > list.pageSize && <div className="inbox-pagination"><button disabled={listPage === 1} onClick={() => { setList(null); setListPage((value) => value - 1); }}>Anterior</button><span>Página {listPage}</span><button disabled={listPage * list.pageSize >= list.total} onClick={() => { setList(null); setListPage((value) => value + 1); }}>Próxima</button></div>}
    </section><section className="card inbox-history" aria-label="Histórico da conversa">
      {!selected ? <p>Selecione uma conversa para ver o histórico.</p> : messageError ? <p className="error" role="alert">{messageError}</p> : !messages ? <p>Carregando mensagens…</p> : <><h2>{contact(messages.conversation)}</h2><p>{messages.conversation.customer ? <>Cliente: {platform ? messages.conversation.customer.fullName : <Link href={`/app/customers/${messages.conversation.customer.id}`}>{messages.conversation.customer.fullName}</Link>}</> : "Contato ainda sem correspondência exata na base de clientes."}</p>
      <div className="inbox-messages">{[...messages.items].reverse().map((message) => <article key={message.id} className={`inbox-message ${message.direction === "OUTBOUND" ? "outbound" : "inbound"}`}><small>{message.direction === "INBOUND" ? "Recebida" : "Enviada pelo WhatsApp"} · {date(message.occurredAt)}</small>{message.kind !== "TEXT" && <p className="inbox-media">{kindNames[message.kind] ?? "Mídia"}</p>}{message.text !== null && <p>{message.text}</p>}{message.direction === "OUTBOUND" && <small>{message.deliveryState === "READ" ? "Lida pelo destinatário" : message.deliveryState === "DELIVERED" ? "Entregue ao destinatário" : message.deliveryState === "FAILED" ? "Falha de entrega" : "Enviada · aguardando confirmação de entrega"}</small>}<MessageMediaDownload kind={message.kind} endpoint={`${prefix}/${encodeURIComponent(selected)}/messages/${encodeURIComponent(message.id)}/media?tenantId=${encodeURIComponent(tenantId)}`} /></article>)}</div>
      {messages.total > messages.pageSize && <div className="inbox-pagination"><button disabled={messagePage === 1} onClick={() => { setMessages(null); setMessagePage((value) => value - 1); }}>Mais recentes</button><span>Página {messagePage}</span><button disabled={messagePage * messages.pageSize >= messages.total} onClick={() => { setMessages(null); setMessagePage((value) => value + 1); }}>Mais antigas</button></div>}</>}
      {selected && messages && <><ConversationCRM key={`crm:${tenantId}:${selected}`} tenantId={tenantId} conversationId={selected} customer={messages.conversation.customer} platform={platform} onLinked={() => setRefresh((value) => value + 1)} /><ConversationAnalysisPanel key={`${tenantId}:${selected}:${messages.conversation.customer?.id ?? ""}`} tenantId={tenantId} conversationId={selected} platform={platform} /></>}
    </section></div>
  </>;
}
