import type { MembershipStatus, Role, UserStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { AuthorizationContext } from "@/domain/access";
import { requireCapability } from "@/lib/auth/context";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { createOpaqueToken, hashToken } from "@/lib/auth/crypto";
import { UserRepository } from "@/repositories/tenant-repositories";
import { recordEvent } from "@/services/events";
import { authorizeTenantMember } from "@/services/customer-scope";

export class UserService {
  list(context: AuthorizationContext) {
    requireCapability(context, "users.read");
    return db.$transaction(async (transaction) => { await authorizeTenantMember(transaction, context, "users.read"); return new UserRepository(transaction).list(context.tenantId); });
  }

  find(context: AuthorizationContext, userId: string) {
    requireCapability(context, "users.read");
    return db.$transaction(async (transaction) => { await authorizeTenantMember(transaction, context, "users.read"); return new UserRepository(transaction).find(context.tenantId, userId); });
  }

  async invite(context: AuthorizationContext, input: { name: string; email: string; role: Role }) {
    requireCapability(context, "users.create");
    const email = input.email.trim().toLowerCase();
    const token = createOpaqueToken();
    const result = await db.$transaction(async (transaction) => {
      await authorizeTenantMember(transaction, context, "users.create");
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
    return { ...result, activationToken: token };
  }

  async update(context: AuthorizationContext, userId: string, input: { name?: string; role?: Role; status?: UserStatus | MembershipStatus }) {
    requireCapability(context, input.role ? "users.manage_roles" : "users.update");
    const scoped = await new UserRepository(db).find(context.tenantId, userId);
    if (!scoped) throw new NotFoundError();
    return db.$transaction(async (transaction) => {
      if (input.name) await transaction.user.update({ where: { id: userId }, data: { name: input.name } });
      const membership = await transaction.membership.update({ where: { userId_tenantId: { userId, tenantId: context.tenantId } }, data: { role: input.role, status: input.status as MembershipStatus | undefined } });
      const action = input.role ? "ROLE_CHANGED" : input.status === "SUSPENDED" ? "USER_DISABLED" : "USER_UPDATED";
      await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action, entityType: "User", entityId: userId, metadata: input.role ? { role: input.role } : undefined });
      return membership;
    });
  }
}
