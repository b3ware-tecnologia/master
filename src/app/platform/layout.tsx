import { requirePlatformAdminPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdminPage();
  const tenants = await db.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const items = [{href:"/platform",label:"Empresas",icon:"users"},{href:"/platform/dispatch",label:"Disparador",icon:"send"},{href:"/platform/conversations",label:"Conversas",icon:"chat"},{href:"/platform/numbers",label:"Números do WhatsApp",icon:"settings"}];
  return <WorkspaceShell platform tenants={tenants} items={items}>{children}</WorkspaceShell>;
}


