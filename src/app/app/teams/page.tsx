import { resolveAuthorizationContext, requireCapability } from "@/lib/auth/context";
import { TeamService } from "@/services/team-service";
import { TeamAdmin } from "@/components/team-admin";
export default async function TeamsPage() { const context = await resolveAuthorizationContext(); requireCapability(context, "teams.read"); const teams = await new TeamService().list(context); return <><h1>Equipes</h1><TeamAdmin teams={JSON.parse(JSON.stringify(teams))} canManage={context.capabilities.includes("teams.archive")}/></>; }
