import { OutreachBoard } from "@/components/outreach-board";
import { requirePlatformAdminPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) { await requirePlatformAdminPage(); const query = await searchParams; const tenant = query.tenantId ? await db.tenant.findFirst({ where: { id: query.tenantId, status: "ACTIVE" }, select: { id: true, name: true } }) : null; return <><h1>IA de relacionamento</h1><p>Defina o público e o objetivo para a assistente iniciar as conversas e encaminhar os clientes à equipe.</p>{tenant ? <><h2>{tenant.name}</h2><OutreachBoard key={tenant.id} tenantId={tenant.id} platform /></> : <section className="card"><p>Selecione a empresa no menu lateral para preparar o relacionamento.</p></section>}</>; }

