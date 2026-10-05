import { redirect } from "next/navigation";
import Link from "next/link";
import { availableTenants } from "@/lib/auth/context";
import { TenantSelector, LogoutButton } from "@/components/tenant-selector";
export default async function SelectCompanyPage() {
  let tenants;
  try { tenants = await availableTenants(); } catch { redirect("/login"); }
  return <main className="content"><section className="card"><h1>Escolha sua empresa</h1>{tenants.length ? <><p>Selecione a empresa para acessar seus atendimentos.</p><TenantSelector tenants={tenants} /></> : <p>Esta conta não possui acesso ativo a uma empresa. Solicite um convite ao administrador.</p>}<p><Link href="/platform">Administração da plataforma</Link></p><LogoutButton /></section></main>;
}
