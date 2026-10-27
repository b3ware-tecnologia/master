import {redirect} from "next/navigation";
import {requirePlatformAdminPage} from "@/lib/page-auth";
export default async function Page({searchParams}:{searchParams:Promise<{tenantId?:string}>}){await requirePlatformAdminPage();const {tenantId}=await searchParams;redirect("/platform/dispatch"+(tenantId?"?tenantId="+encodeURIComponent(tenantId):""));}