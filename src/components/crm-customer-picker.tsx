"use client";
import { useEffect, useState } from "react";
export type CustomerOption = { id: string; fullName: string };
export function CRMCustomerPicker({ endpoint, value, onSelect }: { endpoint: string; value: CustomerOption | null; onSelect: (customer: CustomerOption | null) => void }) {
  const [q, setQ] = useState(""); const [items, setItems] = useState<CustomerOption[]>([]); const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const result = await response.json(); if (!controller.signal.aborted) { setItems(result); setError(""); }
      } catch { if (!controller.signal.aborted) { setItems([]); setError("Não foi possível buscar os clientes."); } }
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [endpoint, q]);
  const choices = value && !items.some((item) => item.id === value.id) ? [value, ...items] : items;
  return <div className="crm-customer-picker"><label>Buscar cliente pelo nome<input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Digite o nome do cliente" maxLength={160} /></label><label>Cliente<select value={value?.id ?? ""} onChange={(event) => onSelect(choices.find((item) => item.id === event.target.value) ?? null)}><option value="">Selecione o cliente correto</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><small>Até 25 resultados por busca. Refine o nome para localizar o cadastro.</small>{error && <p className="error" role="alert">{error}</p>}</div>;
}
