import {resolveAuthorizationContext,requireCapability} from "@/lib/auth/context";
import {DispatchWorkspace} from "@/components/dispatch-workspace";
export default async function Page(){const context=await resolveAuthorizationContext();requireCapability(context,"plans.manage");return <DispatchWorkspace tenantId={context.tenantId}/>;}