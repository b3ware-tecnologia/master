import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { MessagingPolicyForm, CommunicationConsentForm } from "@/components/messaging-governance-form";

export default async function GovernancePage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const context = await resolveAuthorizationContext(); requireCapability(context, "messaging.manage");
  const { customerId } = await searchParams;
  const [policy, customer] = await Promise.all([db.messagingPolicy.findUnique({ where: { tenantId: context.tenantId } }), customerId ? db.customer.findFirst({ where: { id: customerId, tenantId: context.tenantId }, include: { communicationPreferences: true } }) : Promise.resolve(null)]);
  if (customerId && !customer) notFound();
  const consentLabels = { UNKNOWN: "Não confirmado", OPTED_IN: "Autorizou contato", OPTED_OUT: "Recusou contato" };
  return <><h1>Governança de mensagens</h1><section className="card"><h2>Política de contato da empresa</h2><p>{policy ? "Política registrada. Alterações passam a valer na próxima verificação." : "Política ainda não registrada. Salve os horários e canais antes de autorizar contatos."}</p><MessagingPolicyForm policy={policy} /></section>{customer ? <section className="card"><h2>Preferências de {customer.fullName}</h2><p>Registre a autorização ou a recusa com a referência da evidência. Dados importados começam sem autorização de contato.</p>{customer.communicationPreferences.map((preference) => <p key={preference.id}>{preference.channel}: {consentLabels[preference.consent]} · {preference.evidence}</p>)}<CommunicationConsentForm customerId={customer.id} /><p><Link href={`/app/relationship-plans?customerId=${customer.id}`}>Voltar aos planos do cliente</Link></p></section> : <p>Abra o planejamento de um cliente para registrar suas preferências. <Link href="/app/relationship-plans">Ver planos</Link></p>}</>;
}
