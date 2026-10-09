import type { AccessScope, Role } from "@prisma/client";

export const capabilities = [
  "tenant.read", "tenant.manage", "users.read", "users.create", "users.update",
  "users.disable", "users.manage_roles", "teams.read", "teams.create", "teams.update",
  "teams.archive", "teams.manage_members", "audit.read", "settings.read", "settings.update",
  "customers.read", "customers.create", "customers.update", "customers.archive",
  "lists.read", "lists.create", "lists.update", "lists.archive", "lists.import",
  "tags.read", "tags.manage",
  "plans.read", "plans.manage", "plans.approve",
  "messaging.read", "messaging.manage",
  "messaging.send",
  "crm.read", "crm.create", "crm.update", "distribution.manage",
] as const;

export type Capability = (typeof capabilities)[number];

export const roleCapabilities: Record<Role, readonly Capability[]> = {
  PLATFORM_ADMIN: [],
  TENANT_MASTER: capabilities,
  TENANT_MANAGER: ["tenant.read", "users.read", "teams.read", "teams.manage_members", "settings.read", "customers.read", "lists.read", "lists.create", "lists.update", "lists.import", "tags.read", "tags.manage", "crm.read", "crm.update", "distribution.manage"],
  CONSULTANT: ["customers.read", "crm.read", "crm.update"],
  VIEWER: ["tenant.read", "customers.read", "lists.read", "tags.read", "crm.read", "teams.read"],
};

export const roleAccessScope: Record<Role, AccessScope> = {
  PLATFORM_ADMIN: "TENANT",
  TENANT_MASTER: "TENANT",
  TENANT_MANAGER: "TEAM",
  CONSULTANT: "ASSIGNED",
  VIEWER: "TENANT",
};

export type AuthorizationContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: Role;
  capabilities: readonly Capability[];
  accessScope: AccessScope;
};

export function can(context: AuthorizationContext, capability: Capability) {
  return context.capabilities.includes(capability);
}
