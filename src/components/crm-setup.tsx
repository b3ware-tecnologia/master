"use client";
import { useEffect, useState } from "react";
type Setup = { teams: { id: string; name: string }[]; members: { id: string; role: string; status: string; user: { name: string; email: string } }[] };
const roles: Record<string, string> = { TENANT_MASTER: "Administrador da empresa", TENANT_MANAGER: "Gestor de equipe", CONSULTANT: "Consultor" };
export function CRMSetupPanel({ base, query, onChanged }: { base: string; query: string; onChanged: () => void }) {
  const [data, setData] = useState<Setup>({ teams: [], members: [] }); const [refresh, setRefresh] = useState(0);
  const [teamName, setTeamName] = useState(""); const [teamId, setTeamId] = useState(""); const [membershipId, setMembershipId] = useState("");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState("CONSULTANT"); const [activation, setActivation] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${base}/setup${query}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(); const value = await response.json(); if (!controller.signal.aborted) setData(value); }).catch(() => { if (!controller.signal.aborted) setError("Não foi possível consultar a configuração da equipe."); });
    return () => controller.abort();
  }, [base, query, refresh]);
  async function act(action: "team" | "invite" | "member") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/${action === "team" ? "teams" : action === "invite" ? "invitations" : "team-members"}${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "team" ? { name: teamName } : action === "invite" ? { name, email, role, ...(teamId ? { teamId } : {}) } : { teamId, membershipId }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "Não foi possível concluir a ação.");
      if (action === "team") { setTeamId(value.id); setTeamName(""); }
      if (action === "invite") { setActivation(value.activationUrl); setName(""); setEmail(""); }
      setRefresh((value) => value + 1); onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "Falha na configuração."); }
    finally { setBusy(false); }
  }
  return <details className="card"><summary>Configurar equipe e acesso dos usuários</summary>{error && <p className="error" role="alert">{error}</p>}<div className="form"><label>Nome da equipe<input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={120} /></label><button disabled={busy || teamName.trim().length < 2} onClick={() => void act("team")}>Criar equipe</button></div>
    <div className="form"><label>Equipe<select value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Selecione uma equipe</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Usuário existente<select value={membershipId} onChange={(event) => setMembershipId(event.target.value)}><option value="">Selecione um usuário</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.user.name} · {roles[member.role]} · {member.status === "INVITED" ? "Aguardando ativação" : "Ativo"}</option>)}</select></label><button disabled={busy || !teamId || !membershipId} onClick={() => void act("member")}>Adicionar à equipe</button></div>
    <h3>Convidar usuário</h3><p>O usuário define sua senha por um link de uso único, válido por 48 horas. O convite pode prepará-lo para a equipe selecionada; a distribuição exige acesso ativado.</p><div className="form"><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} /></label><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} /></label><label>Perfil<select value={role} onChange={(event) => setRole(event.target.value)}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button disabled={busy || name.trim().length < 2 || !email.includes("@")} onClick={() => void act("invite")}>Gerar convite</button></div>
    {activation && <div className="card"><p>Convite gerado. Compartilhe o link com o usuário por um canal seguro.</p><label>Link de ativação<input readOnly value={activation} style={{ width: "100%" }} /></label><button onClick={() => { setActivation(""); }}>Ocultar link</button></div>}
  </details>;
}
