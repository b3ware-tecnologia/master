import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { UserService } from "@/services/user-service";
import { UserAdmin } from "@/components/user-admin";
export default async function UsersPage() { const context = await resolveAuthorizationContext(); requireCapability(context, "users.read"); const users = await new UserService().list(context); return <><h1>Usuários</h1><UserAdmin users={JSON.parse(JSON.stringify(users))} canManage={context.capabilities.includes("users.manage_roles")}/></>; }
