import { cookies,headers } from "next/headers";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/crypto";
import { roleAccessScope, roleCapabilities, type AuthorizationContext, type Capability } from "@/domain/access";
import { AuthenticationError, AuthorizationError } from "@/domain/errors";
import { logger } from "@/lib/logger";

import {singleCompanyMode,operationalCompanySlug} from "@/lib/company-mode";
import {localNoAuthEnabled} from "@/lib/local-runtime";

export const sessionCookieName = "bm_session";
export const tenantCookieName = "bm_tenant";
export async function localAccessRequestAllowed(){
  if(!localNoAuthEnabled())return false;const h=await headers();const loopbackHosts=["127.0.0.1:3020","localhost:3020","[::1]:3020"];
  return loopbackHosts.includes(h.get("host")??"")&&!h.get("cf-ray")&&!h.get("cf-connecting-ip")&&(!h.get("x-forwarded-host")||loopbackHosts.includes(h.get("x-forwarded-host")!))&&(!h.get("x-forwarded-for")||h.get("x-forwarded-for")!.split(",").every(value=>["127.0.0.1","::1","::ffff:127.0.0.1"].includes(value.trim())));
}

export async function authenticatedSession() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  const session = token?await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { memberships: { include: { tenant: true } } } } } }):null;
  if(session&&session.expiresAt>new Date()&&session.user.status==="ACTIVE")return session;
  if(await localAccessRequestAllowed()){
    const user=await db.user.findUnique({where:{email:"erico.andrade@b3ware.com.br"},include:{memberships:{include:{tenant:true}}}});
    if(user?.status==="ACTIVE"&&user.memberships.some(m=>m.role==="TENANT_MASTER"&&m.status==="ACTIVE"&&m.tenant.slug===operationalCompanySlug()&&m.tenant.status==="ACTIVE")){const now=new Date();return {id:"local-owner-access",userId:user.id,user,tokenHash:"",createdAt:now,lastSeenAt:now,expiresAt:new Date(now.valueOf()+3600000)};}
  }
  throw new AuthenticationError("Authentication required");
}

export async function availableTenants() {
  const session = await authenticatedSession();
  return session.user.memberships.filter((item) => item.status === "ACTIVE" && item.tenant.status === "ACTIVE" && item.role !== "PLATFORM_ADMIN" && (!singleCompanyMode() || item.tenant.slug === operationalCompanySlug())).map((item) => ({ id: item.tenantId, name: item.tenant.name, role: item.role })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveAuthorizationContext(requestedTenantId?: string | null): Promise<AuthorizationContext> {
  const cookieStore = await cookies();
  const session = await authenticatedSession();
  const memberships = session.user.memberships.filter((item) => item.status === "ACTIVE" && item.tenant.status === "ACTIVE" && item.role !== "PLATFORM_ADMIN" && (!singleCompanyMode() || item.tenant.slug === operationalCompanySlug()));
  const selectedTenantId = requestedTenantId ?? (singleCompanyMode() ? memberships[0]?.tenantId : cookieStore.get(tenantCookieName)?.value);
  const membership = selectedTenantId ? memberships.find((item) => item.tenantId === selectedTenantId) : memberships.length === 1 ? memberships[0] : undefined;
  if (!membership) throw new AuthorizationError("Active tenant membership required");
  logger.info({ event: "tenant_resolved", tenantId: membership.tenantId, userId: session.userId });
  return { userId: session.userId, tenantId: membership.tenantId, membershipId: membership.id, role: membership.role, capabilities: roleCapabilities[membership.role], accessScope: roleAccessScope[membership.role] };
}

export async function requirePlatformAdmin() {
  if(singleCompanyMode()) throw new AuthorizationError("Admin Center indisponível nesta operação.");
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
