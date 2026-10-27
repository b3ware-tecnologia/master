import {requirePlatformAdminPage} from "@/lib/page-auth";
import {DispatchWorkspace} from "@/components/dispatch-workspace";
import Link from "next/link";
export default async function Page({searchParams}:{searchParams:Promise<{tenantId?:string}>}){await requirePlatformAdminPage();const {tenantId}=await searchParams;return tenantId?<DispatchWorkspace tenantId={tenantId} platform/>:<section className="panel empty-state"><h1>Selecione uma empresa</h1><Link href="/platform">Abrir Admin Center →</Link></section>;}