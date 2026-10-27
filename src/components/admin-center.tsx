"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
type Company={id:string;name:string;status:string;_count:{customers:number;memberships:number;messagingConnections:number}};
export function AdminCenter(){
  const [companies,setCompanies]=useState<Company[]>([]);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [invitation,setInvitation]=useState<{activationUrl:string;adminEmail:string}|null>(null);
  async function load(){const r=await fetch("/api/platform/companies",{cache:"no-store"});if(!r.ok)throw new Error("Não foi possível consultar as empresas.");setCompanies(await r.json());}
  useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
  return <><header className="page-header"><div><span className="eyebrow">ADMIN CENTER</span><h1>Empresas</h1><p>Crie os espaços de trabalho e acompanhe cada operação.</p></div></header>{error&&<p role="alert" className="error">{error}</p>}
    <details className="panel"><summary>Cadastrar empresa</summary><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError("");try{const r=await fetch("/api/platform/companies",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(f),requestKey:crypto.randomUUID()})});const v=await r.json();if(!r.ok)throw new Error(v.error);setInvitation(v);await load();}catch(e){setError(e instanceof Error?e.message:"Falha ao criar empresa.");}finally{setBusy(false);}}}>
    <label>Nome da empresa<input name="name" required minLength={2} maxLength={160}/></label><label>Nome do administrador<input name="adminName" required minLength={2}/></label><label>E-mail do administrador<input name="adminEmail" type="email" required/></label><button disabled={busy}>{busy?"Criando…":"Criar empresa e convite"}</button></form></details>
    {invitation&&<section className="notice" role="status"><strong>Empresa criada</strong><p>O administrador {invitation.adminEmail} define a própria senha. O convite é válido por 48 horas.</p><button onClick={()=>void navigator.clipboard.writeText(invitation.activationUrl)}>Copiar link de ativação</button></section>}
    <div className="company-grid">{companies.map(c=><article className="panel" key={c.id}><span className="eyebrow">{c.status==="ACTIVE"?"EMPRESA ATIVA":"EMPRESA INATIVA"}</span><h2>{c.name}</h2><p>{c._count.customers} contatos · {c._count.memberships} usuários · {c._count.messagingConnections} números</p><Link className="text-link" href={`/platform/dispatch?tenantId=${c.id}`}>Abrir operação →</Link><p><Link href={`/platform/numbers?tenantId=${c.id}`}>Configurar números do WhatsApp</Link></p></article>)}</div></>;
}
