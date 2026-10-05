import { z } from "zod";
import type { CRMCaseStatus } from "@prisma/client";

export const statuses = ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"] as const;
export const transitions: Record<CRMCaseStatus, readonly CRMCaseStatus[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED"], IN_PROGRESS: ["WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [],
};
const id = z.string().min(1).max(100);
export const createCaseSchema = z.strictObject({ requestKey: z.uuid(), customerId: id, conversationId: id.optional(), planId: id.optional(), title: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).optional() });
export const caseActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("transition"), requestKey: z.uuid(), expectedVersion: z.number().int().min(0), status: z.enum(statuses), note: z.string().trim().min(3).max(2000) }),
  z.strictObject({ action: z.literal("note"), requestKey: z.uuid(), expectedVersion: z.number().int().min(0), note: z.string().trim().min(3).max(2000) }),
  z.strictObject({ action: z.literal("schedule"), requestKey: z.uuid(), expectedVersion: z.number().int().min(0), dueAt: z.iso.datetime({ offset: true }).nullable() }),
]);
export const assignmentSchema = z.strictObject({ teamId: id, assignedMembershipId: id.nullable(), expectedVersion: z.number().int().min(0).nullable() });
export const linkCustomerSchema = z.strictObject({ customerId: id });
export const createCRMCustomerSchema = z.strictObject({ requestKey: z.uuid(), fullName: z.string().trim().min(2).max(200) });
export const crmPageSchema = z.coerce.number().int().min(1).max(10_000);
export const caseFiltersSchema = z.strictObject({ due: z.enum(["ALL", "OVERDUE", "NEXT_24H", "UNSCHEDULED"]).default("ALL"), q: z.string().trim().max(160).default("") });
export const crmTeamSchema = z.strictObject({ name: z.string().trim().min(2).max(120) });
export const crmInviteSchema = z.strictObject({ name: z.string().trim().min(2).max(160), email: z.email().max(200), role: z.enum(["TENANT_MASTER", "TENANT_MANAGER", "CONSULTANT"]), teamId: id.optional() });
export const crmTeamMemberSchema = z.strictObject({ teamId: id, membershipId: id });
