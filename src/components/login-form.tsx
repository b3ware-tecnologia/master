"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function LoginForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function login(formData: FormData) {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData)) });
      if (!response.ok) { setError("Não foi possível entrar. Confira seu email e senha."); return; }
      const result = await response.json(); router.push(["/platform", "/select-company"].includes(result.redirectTo) ? result.redirectTo : "/app"); router.refresh();
    } catch { setError("Não foi possível conectar. Tente novamente."); } finally { setBusy(false); }
  }
  return <form className="form" action={login} aria-busy={busy}><label htmlFor="login-email">Email de acesso</label><input id="login-email" name="email" type="email" placeholder="voce@empresa.com.br" autoComplete="username" required disabled={busy} /><label htmlFor="login-password">Senha</label><input id="login-password" name="password" type="password" placeholder="Sua senha" autoComplete="current-password" minLength={12} required disabled={busy} /><button disabled={busy}>{busy ? "Entrando…" : "Entrar no BM Crédito"}</button>{error && <p className="error" role="alert">{error}</p>}</form>;
}
