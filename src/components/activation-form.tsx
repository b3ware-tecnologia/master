"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export function ActivationForm() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
    // The invitation stays out of HTTP URLs, referrers and browser history.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) { setError("As senhas precisam ser iguais."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: form.get("password") }) });
      if (response.ok) { setComplete(true); setToken(""); }
      else setError("Convite inválido ou expirado. Solicite um novo convite.");
    } catch { setError("Falha de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  if (complete) return <><p>Seu acesso foi ativado. Entre com seu e-mail e a senha que acabou de definir.</p><Link href="/login">Entrar no CRM</Link></>;
  return <><p>Defina sua senha para ativar o acesso. Use pelo menos 12 caracteres.</p><form className="form" onSubmit={activate}><label>Senha<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required disabled={busy} /></label><label>Confirmar senha<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={200} required disabled={busy} /></label><button disabled={busy || token.length < 32}>{busy ? "Ativando…" : "Ativar acesso"}</button></form>{!token && <p>Abra o link de convite para ativar seu acesso.</p>}{error && <p className="error" role="alert">{error}</p>}</>;
}
