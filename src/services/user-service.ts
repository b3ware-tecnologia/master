import type { MembershipStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { AuthorizationContext } from "@/domain/access";
import { requireCapability } from "@/lib/auth/context";
import { AuthorizationError, ConflictError, NotFoundError } from "@/domain/errors";
import { createOpaqueToken, hashToken } from "@/lib/auth/crypto";
import { UserRepository } from "@/repositories/tenant-repositories";
import { recordEvent } from "@/services/events";
import { authorizeTenantMember } from "@/services/customer-scope";

export class UserService {
  list(context: AuthorizationContext) {
    requireCapability(context, "users.read");
    return db.$transaction(async (transaction) => { await authorizeTenantMember(transaction, context, "users.read"); const teams = context.accessScope === "TEAM" ? (await transaction.team.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE", members: { some: { userId: context.userId, tenantId: context.tenantId } } }, select: { id: true } })).map((team) => team.id) : undefined; return new UserRepository(transaction).list(context.tenantId, teams); });
  }

  find(context: AuthorizationContext, userId: string) {
    requireCapability(context, "users.read");
    return db.$transaction(async (transaction) => { await authorizeTenantMember(transaction, context, "users.read"); const teams = context.accessScope === "TEAM" ? (await transaction.team.findMany({ where: { tenantId: context.tenantId, status: "ACTIVE", members: { some: { userId: context.userId, tenantId: context.tenantId } } }, select: { id: true } })).map((team) => team.id) : undefined; return new UserRepository(transaction).find(context.tenantId, userId, teams); });
  }

  async invite(context: AuthorizationContext, input: { name: string; email: string; role: Role }) {
    requireCapability(context, "users.create");
    const email = input.email.trim().toLowerCase();
    const token = createOpaqueToken();
    const result = await db.$transaction(async (transaction) => {
      await authorizeTenantMember(transaction, context, "users.create");
      if (input.role === "PLATFORM_ADMIN") throw new AuthorizationError();
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-invite:${email}`}, 0))`;
      const user = await transaction.user.upsert({
        where: { email }, update: {}, create: { email, name: input.name, status: "INVITED" }, select: { id: true, name: true, email: true, status: true },
      });
      const existing = await transaction.membership.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId: context.tenantId } } });
      if (existing) throw new ConflictError("User already belongs to this tenant");
      if (user.status !== "INVITED") throw new ConflictError("Existing accounts cannot reset their credentials through an invitation");
      const membership = await transaction.membership.create({ data: { userId: user.id, tenantId: context.tenantId, role: input.role, status: "INVITED" } });
      await transaction.inviteToken.create({ data: { userId: user.id, tenantId: context.tenantId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) } });
      await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: "USER_INVITED", entityType: "User", entityId: user.id, metadata: { role: input.role } });
      return { user, membership };
    });
    return { ...result, activationUrl: `${process.env.APP_URL}/activate#token=${encodeURIComponent(token)}`, expiresAt: new Date(Date.now() + 48 * 3600_000) };
  }

  async update(context: AuthorizationContext, userId: string, input: { name?: string; role?: Role; status?: MembershipStatus }) {
    const required = [...(input.role ? ["users.manage_roles" as const] : []), ...(input.status ? ["users.disable" as const] : []), ...(input.name ? ["users.update" as const] : [])];
    if (!required.length) throw new ConflictError("Informe uma alteração.");
    for (const capability of required) requireCapability(context, capability);
    return db.$transaction(async (transaction) => {
      // Serialize demotions/suspensions so two administrators cannot remove the last master concurrently.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tenant-membership:${context.tenantId}`}, 0))`;
      for (const capability of required) await authorizeTenantMember(transaction, context, capability);
      const scoped = await transaction.membership.findUnique({ where: { userId_tenantId: { userId, tenantId: context.tenantId } }, include: { user: { select: { status: true } } } });
      if (!scoped) throw new NotFoundError();
      if (scoped.role === "PLATFORM_ADMIN" || input.role === "PLATFORM_ADMIN") throw new AuthorizationError();
      if (input.status === "INVITED" && scoped.status !== "INVITED") throw new ConflictError("O vínculo não pode retornar ao estado de convite.");
      if (input.status === "ACTIVE" && (scoped.status === "INVITED" || scoped.user.status !== "ACTIVE")) throw new ConflictError("O acesso precisa ser ativado pelo titular da conta.");
      if (scoped.role === "TENANT_MASTER" && scoped.status === "ACTIVE" && ((input.role && input.role !== "TENANT_MASTER") || (input.status && input.status !== "ACTIVE"))) {
        if (await transaction.membership.count({ where: { tenantId: context.tenantId, role: "TENANT_MASTER", status: "ACTIVE", user: { status: "ACTIVE" } } }) <= 1) throw new ConflictError("Mantenha pelo menos um administrador ativo nesta empresa.");
      }
      if (input.name && await transaction.membership.findFirst({ where: { userId, tenantId: { not: context.tenantId } } })) throw new ConflictError("O nome de uma conta compartilhada deve ser alterado pelo titular.");
      if (input.name) await transaction.user.update({ where: { id: userId }, data: { name: input.name } });
      const membership = await transaction.membership.update({ where: { userId_tenantId: { userId, tenantId: context.tenantId } }, data: { role: input.role, status: input.status } });
      const action = input.role ? "ROLE_CHANGED" : input.status === "SUSPENDED" ? "USER_DISABLED" : "USER_UPDATED";
      await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action, entityType: "User", entityId: userId, metadata: input.role ? { role: input.role } : undefined });
      return membership;
    });
  }
}
