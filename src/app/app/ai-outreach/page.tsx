import { OutreachBoard } from "@/components/outreach-board";
import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
export default async function OutreachPage() { const context = await resolveAuthorizationContext(); requireCapability(context, "plans.manage"); return <><h1>IA de relacionamento</h1><p>Defina com quem conversar e o objetivo. A assistente inicia o contato e continua a conversa dentro dos limites autorizados.</p><OutreachBoard tenantId={context.tenantId} /></>; }
