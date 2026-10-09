import type { Prisma } from "@prisma/client";
import type { AuthorizationContext, Capability } from "@/domain/access";
import { roleAccessScope, roleCapabilities } from "@/domain/access";
import { AuthorizationError } from "@/domain/errors";
import { requireCapability } from "@/lib/auth/context";

export async function authorizeTenantMember(transaction: Prisma.TransactionClient, context: AuthorizationContext, capability: Capability) {
  requireCapability(context, capability);
  const membership = await transaction.membership.findFirst({ where: { id: context.membershipId, tenantId: context.tenantId, userId: context.userId, role: context.role, status: "ACTIVE", user: { status: "ACTIVE" }, tenant: { status: "ACTIVE" } } });
  if (!membership || context.role === "PLATFORM_ADMIN" || !roleCapabilities[membership.role].includes(capability) || context.accessScope !== roleAccessScope[membership.role]) throw new AuthorizationError();
}
export function customerScope(context: AuthorizationContext): Prisma.CustomerWhereInput {
  const base = { tenantId: context.tenantId };
  if ((context.role === "TENANT_MASTER" || context.role === "VIEWER") && context.accessScope === "TENANT") return base;
  const team = { tenantId: context.tenantId, status: "ACTIVE" as const, members: { some: { tenantId: context.tenantId, userId: context.userId } } };
  if (context.role === "TENANT_MANAGER" && context.accessScope === "TEAM") return { ...base, assignment: { is: { tenantId: context.tenantId, team } } };
  if (context.role === "CONSULTANT" && context.accessScope === "ASSIGNED") return { ...base, status: "ACTIVE", assignment: { is: { tenantId: context.tenantId, assignedMembershipId: context.membershipId, team, assignedMembership: { role: "CONSULTANT", status: "ACTIVE", user: { status: "ACTIVE" } } } } };
  throw new AuthorizationError();
}
