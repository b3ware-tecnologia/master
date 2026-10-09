import { CommercialWorkspace } from "@/components/commercial-workspace";
import { requirePlatformAdminPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
export default async function CommercialPage({searchParams}:{searchParams:Promise<{tenantId?:string}>}) { await requirePlatformAdminPage(); const query=await searchParams; const tenant=query.tenantId?await db.tenant.findFirst({where:{id:query.tenantId,status:"ACTIVE"},select:{id:true,name:true}}):null; return tenant?<CommercialWorkspace key={tenant.id} tenantId={tenant.id} platform />:<><h1>Operação comercial</h1><section className="card"><p>Selecione a empresa no menu lateral.</p></section></>; }

