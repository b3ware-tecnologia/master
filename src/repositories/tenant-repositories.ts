import type { Prisma, PrismaClient } from "@prisma/client";

type Database = PrismaClient | Prisma.TransactionClient;

export class UserRepository {
  constructor(private readonly database: Database) {}
  list(tenantId: string) {
    return this.database.user.findMany({ where: { memberships: { some: { tenantId } } }, select: { id: true, email: true, name: true, status: true, createdAt: true, updatedAt: true, memberships: { where: { tenantId } }, teamMembers: { where: { tenantId }, include: { team: true } } }, orderBy: { createdAt: "desc" } });
  }
  find(tenantId: string, userId: string) {
    return this.database.user.findFirst({ where: { id: userId, memberships: { some: { tenantId } } }, select: { id: true, email: true, name: true, status: true, createdAt: true, updatedAt: true, memberships: { where: { tenantId } } } });
  }
}

export class TeamRepository {
  constructor(private readonly database: Database) {}
  list(tenantId: string) { return this.database.team.findMany({ where: { tenantId }, include: { _count: { select: { members: true } }, members: true }, orderBy: { createdAt: "desc" } }); }
  find(tenantId: string, teamId: string) { return this.database.team.findFirst({ where: { id: teamId, tenantId } }); }
}

export class AuditRepository {
  constructor(private readonly database: Database) {}
  list(tenantId: string) { return this.database.auditEvent.findMany({ where: { tenantId }, include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }); }
}
