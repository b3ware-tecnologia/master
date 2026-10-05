import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/crypto";
import { roleAccessScope, roleCapabilities, type AuthorizationContext, type Capability } from "@/domain/access";
import { AuthenticationError, AuthorizationError } from "@/domain/errors";
import { logger } from "@/lib/logger";

export const sessionCookieName = "bm_session";
export const tenantCookieName = "bm_tenant";

export async function authenticatedSession() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) throw new AuthenticationError("Authentication required");
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { memberships: { include: { tenant: true } } } } } });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") throw new AuthenticationError("Authentication required");
  return session;
}

export async function availableTenants() {
  const session = await authenticatedSession();
  return session.user.memberships.filter((item) => item.status === "ACTIVE" && item.tenant.status === "ACTIVE" && item.role !== "PLATFORM_ADMIN").map((item) => ({ id: item.tenantId, name: item.tenant.name, role: item.role })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveAuthorizationContext(requestedTenantId?: string | null): Promise<AuthorizationContext> {
  const cookieStore = await cookies();
  const session = await authenticatedSession();
  const memberships = session.user.memberships.filter((item) => item.status === "ACTIVE" && item.tenant.status === "ACTIVE" && item.role !== "PLATFORM_ADMIN");
  const selectedTenantId = requestedTenantId ?? cookieStore.get(tenantCookieName)?.value;
  const membership = selectedTenantId ? memberships.find((item) => item.tenantId === selectedTenantId) : memberships.length === 1 ? memberships[0] : undefined;
  if (!membership) throw new AuthorizationError("Active tenant membership required");
  logger.info({ event: "tenant_resolved", tenantId: membership.tenantId, userId: session.userId });
  return { userId: session.userId, tenantId: membership.tenantId, membershipId: membership.id, role: membership.role, capabilities: roleCapabilities[membership.role], accessScope: roleAccessScope[membership.role] };
}

export async function requirePlatformAdmin() {
  const session = await authenticatedSession();
  if (!session.user.memberships.some((item) => item.role === "PLATFORM_ADMIN" && item.status === "ACTIVE" && item.tenant.status === "ACTIVE")) throw new AuthorizationError("Access denied");
  return session.userId;
}

export function requireCapability(context: AuthorizationContext, capability: Capability) {
  if (!context.capabilities.includes(capability)) {
    logger.warn({ event: "authorization_denied", tenantId: context.tenantId, userId: context.userId, capability });
    throw new AuthorizationError("Access denied");
  }
}
