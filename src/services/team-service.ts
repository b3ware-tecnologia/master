import type { TeamStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { AuthorizationContext } from "@/domain/access";
import { requireCapability } from "@/lib/auth/context";
import { AuthorizationError, ConflictError, NotFoundError } from "@/domain/errors";
import { TeamRepository, UserRepository } from "@/repositories/tenant-repositories";
import { recordEvent } from "@/services/events";
import { authorizeTenantMember } from "@/services/customer-scope";

export class TeamService {
  list(context: AuthorizationContext) { return db.$transaction(async (transaction) => {
    await authorizeTenantMember(transaction, context, "teams.read");
    if (context.accessScope === "TEAM") return transaction.team.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE", members: { some: { tenantId: context.tenantId, userId: context.userId } } }, include: { _count: { select: { members: true } }, members: true }, orderBy: { createdAt: "desc" } });
    return new TeamRepository(transaction).list(context.tenantId);
  }); }
  async create(context: AuthorizationContext, input: { name: string; description?: string }) {
    requireCapability(context, "teams.create");
    return db.$transaction(async (transaction) => {
      await authorizeTenantMember(transaction, context, "teams.create");
      const team = await transaction.team.create({ data: { ...input, tenantId: context.tenantId } });
      await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: "TEAM_CREATED", entityType: "Team", entityId: team.id });
      return team;
    });
  }
  async update(context: AuthorizationContext, teamId: string, input: { name?: string; description?: string; status?: TeamStatus }) {
    requireCapability(context, input.status === "ARCHIVED" ? "teams.archive" : "teams.update");
    return db.$transaction(async (transaction) => {
      await authorizeTenantMember(transaction, context, input.status === "ARCHIVED" ? "teams.archive" : "teams.update");
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-lifecycle:${teamId}`}, 0))`;
      if (!await new TeamRepository(transaction).find(context.tenantId, teamId)) throw new NotFoundError();
      const team = await transaction.team.update({ where: { id_tenantId: { id: teamId, tenantId: context.tenantId } }, data: input });
      await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: input.status === "ARCHIVED" ? "TEAM_ARCHIVED" : "TEAM_UPDATED", entityType: "Team", entityId: teamId });
      return team;
    });
  }
  async addMember(context: AuthorizationContext, teamId: string, userId: string) {
    requireCapability(context, "teams.manage_members");
    const [team, user] = await Promise.all([new TeamRepository(db).find(context.tenantId, teamId), new UserRepository(db).find(context.tenantId, userId)]);
    if (!team || !user) throw new NotFoundError();
    return db.$transaction(async (transaction) => {
      await authorizeTenantMember(transaction, context, "teams.manage_members");
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-lifecycle:${teamId}`}, 0))`;
      if (!await transaction.team.findFirst({ where: { id: teamId, tenantId: context.tenantId, status: "ACTIVE" } })) throw new ConflictError("A equipe não está ativa.");
      if (context.accessScope === "TEAM" && !await transaction.teamMember.findFirst({ where: { tenantId: context.tenantId, teamId, userId: context.userId, team: { status: "ACTIVE" } } })) throw new AuthorizationError();
      if (!await transaction.membership.findFirst({ where: { tenantId: context.tenantId, userId, status: "ACTIVE", user: { status: "ACTIVE" } } })) throw new NotFoundError();
      const existing = await transaction.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
      if (existing) return existing;
      const member = await transaction.teamMember.create({ data: { tenantId: context.tenantId, teamId, userId } });
      await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: "TEAM_MEMBER_ADDED", entityType: "Team", entityId: teamId, metadata: { userId } });
      return member;
    });
  }
  async removeMember(context: AuthorizationContext, teamId: string, userId: string) {
    requireCapability(context, "teams.manage_members");
    await db.$transaction(async (transaction) => {
      await authorizeTenantMember(transaction, context, "teams.manage_members");
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-lifecycle:${teamId}`}, 0))`;
      const membership = await transaction.teamMember.findFirst({ where: { tenantId: context.tenantId, teamId, userId } });
      if (!membership) throw new NotFoundError();
      if (context.accessScope === "TEAM" && !await transaction.teamMember.findFirst({ where: { tenantId: context.tenantId, teamId, userId: context.userId, team: { status: "ACTIVE" } } })) throw new AuthorizationError();
      await transaction.teamMember.delete({ where: { id: membership.id } });
      await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: "TEAM_MEMBER_REMOVED", entityType: "Team", entityId: teamId, metadata: { userId } });
    });
  }
}
