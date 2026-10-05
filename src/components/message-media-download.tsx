"use client";
import { useState } from "react";
export function MessageMediaDownload({ endpoint, kind }: { endpoint: string; kind: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"].includes(kind)) return null;
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) { const value = await response.json(); throw new Error(value.code === "MEDIA_TOO_LARGE" ? "O arquivo excede o limite de 8 MB." : "Arquivo indisponível. Ele pode ter expirado no WhatsApp ou ter um formato não suportado."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = response.headers.get("content-disposition")?.match(/filename="([A-Za-z0-9_.-]+)"/)?.[1] ?? "arquivo-whatsapp";
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) { setError(error instanceof Error ? error.message : "Falha ao baixar arquivo."); } finally { setBusy(false); }
  }
  return <div className="message-download"><button disabled={busy} type="button" onClick={() => void download()}>{busy ? "Baixando…" : "Baixar arquivo"}</button>{error && <p className="error" role="alert">{error}</p>}</div>;
}
