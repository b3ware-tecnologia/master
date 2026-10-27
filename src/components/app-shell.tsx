import type {Capability} from "@/domain/access";
import type {Role} from "@prisma/client";
import {WorkspaceShell} from "@/components/workspace-shell";
export function AppShell({children,capabilities=[],tenants=[],selectedTenant}:{children:React.ReactNode;capabilities?:readonly Capability[];tenants?:{id:string;name:string;role:Role}[];selectedTenant?:string}){
 const items=[...(capabilities.includes("lists.read")?[{href:"/app/lists",label:"Listas e contatos",icon:"users"}]:[]),...(capabilities.includes("plans.manage")?[{href:"/app/dispatch",label:"Disparador",icon:"send"}]:[]),...(capabilities.includes("crm.read")?[{href:"/app/conversations",label:"Conversas",icon:"chat"}]:[]),...(capabilities.includes("settings.read")?[{href:"/app/settings",label:"Configurações",icon:"settings"}]:[])];
 return <WorkspaceShell items={items} tenants={tenants} selectedTenant={selectedTenant}>{children}</WorkspaceShell>;
}