import {redirect} from "next/navigation";
import {resolveAuthorizationContext} from "@/lib/auth/context";
export default async function Page(){const context=await resolveAuthorizationContext();redirect(context.capabilities.includes("plans.manage")?"/app/dispatch":"/app/conversations");}