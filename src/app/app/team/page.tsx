import {resolveAuthorizationContext,requireCapability} from "@/lib/auth/context";
import {CRMSetupPanel} from "@/components/crm-setup";
export default async function Page(){const context=await resolveAuthorizationContext();requireCapability(context,"users.create");return <><header className="page-header"><div><h1>Equipe</h1><p>Cadastre suas funcionárias, organize a equipe e defina quem recebe os atendimentos.</p></div></header><CRMSetupPanel expanded base="/api" query={`?tenantId=${context.tenantId}`} onChanged={undefined}/></>;}
