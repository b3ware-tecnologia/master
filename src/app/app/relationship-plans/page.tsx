import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { listPlans } from "@/services/relationship-plan-service";
import { RelationshipPlanActions, RelationshipPlanForm } from "@/components/relationship-plan-form";

const statuses = { DRAFT: "Rascunho", APPROVED: "Aprovado", CANCELLED: "Cancelado" };
const channels = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", PHONE: "Telefone" };
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ customerId?: string; page?: string }> }) {
  const context = await resolveAuthorizationContext();
  requireCapability(context, "plans.read");
  const params = await searchParams;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const customer = params.customerId ? await db.customer.findFirst({ where: { id: params.customerId, tenantId: context.tenantId, status: "ACTIVE" }, select: { id: true, fullName: true } }) : null;
  if (params.customerId && !customer) notFound();
  const plans = await listPlans(context, customer?.id, page);
  const suffix = customer ? `&customerId=${encodeURIComponent(customer.id)}` : "";
  return <><h1>Planejamento de relacionamento</h1><p>Prepare e aprove cada contato. O agendamento organiza o plano; o envio depende da governança e da conexão do canal.</p>
    {customer ? <section className="card"><h2>Novo plano para {customer.fullName}</h2><RelationshipPlanForm customerId={customer.id} /></section> : <p>Abra um cliente para criar seu plano de relacionamento. <Link href="/app/customers">Ver clientes</Link></p>}
    {plans.length ? plans.map((plan) => <section key={plan.id} className="card"><h2><Link href={`/app/customers/${plan.customerId}`}>{plan.customer.fullName}</Link> · {plan.purpose}</h2><p>{statuses[plan.status]} · {channels[plan.channel]} · {plan.scheduledAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (São Paulo)</p><p style={{ whiteSpace: "pre-wrap" }}>{plan.message}</p><RelationshipPlanActions id={plan.id} status={plan.status} /></section>) : <section className="card"><p>Nenhum plano nesta página.</p></section>}
    <nav className="form" aria-label="Paginação">{page > 1 && <Link href={`/app/relationship-plans?page=${page - 1}${suffix}`}>Anterior</Link>}{plans.length === 50 && <Link href={`/app/relationship-plans?page=${page + 1}${suffix}`}>Próxima</Link>}</nav>
  </>;
}
