"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type ImportState = { id: string; name: string; status: string; processedRows: number; errorRows: number; totalRows: number; summary: { createdCount: number; matchedCount: number; errorCount: number } | null; errors: { id: string; rowNumber: number | null; code: string }[] };
const labels: Record<string, string> = { PREVIEWED: "Aguardando confirmação", PROCESSING: "Processando", COMPLETED: "Concluída", COMPLETED_WITH_ERRORS: "Concluída com erros", FAILED: "Falhou", CANCELLED: "Cancelada" };
export function ImportProgress({ initial }: { initial: ImportState }) {
  const [item, setItem] = useState(initial); const [error, setError] = useState("");
  useEffect(() => {
    if (initial.status !== "PROCESSING") return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try { const response = await fetch(`/api/imports/${encodeURIComponent(initial.id)}`, { cache: "no-store", signal: controller.signal }); if (!response.ok) throw new Error(); const value = await response.json(); if (!controller.signal.aborted) { setItem(value); setError(""); if (value.status === "PROCESSING") timer = setTimeout(() => void load(), 3000); } }
      catch { if (!controller.signal.aborted) setError("Não foi possível atualizar o progresso. Recarregue a página para verificar seu acesso."); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [initial.id, initial.status]);
  const finished = item.processedRows + item.errorRows;
  return <section className="card" aria-label="Progresso da importação"><p>Status: <strong>{labels[item.status] ?? item.status}</strong></p><progress aria-label="Linhas finalizadas" max={Math.max(1, item.totalRows)} value={finished} /><p>{finished} de {item.totalRows} linhas finalizadas · {item.processedRows} processadas · {item.errorRows} com erro.</p>{item.summary && <p>Clientes criados: {item.summary.createdCount} · Clientes já existentes: {item.summary.matchedCount}</p>}{item.errors.length > 0 && <details><summary>Linhas com erro ({item.errors.length})</summary><p>Revise essas linhas no arquivo de origem antes de uma nova importação.</p>{item.errors.slice(0, 100).map((row) => <p key={row.id}>Linha {row.rowNumber ?? "—"}: {row.code}</p>)}{item.errors.length > 100 && <p>Exibindo os primeiros 100 erros.</p>}</details>}{item.status.startsWith("COMPLETED") && <Link href="/app/customers">Abrir clientes importados →</Link>}{error && <p className="error" role="alert">{error}</p>}</section>;
}
