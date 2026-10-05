import { z } from "zod";
import type { AuthorizationContext } from "@/domain/access";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { recordEvent } from "@/services/events";

export const createPlanSchema = z.object({
  customerId: z.string().min(1), requestKey: z.uuid(),
  purpose: z.string().trim().min(3).max(200),
  message: z.string().trim().min(1).max(4000),
  channel: z.enum(["WHATSAPP", "EMAIL", "PHONE"]),
  scheduledAt: z.iso.datetime({ offset: true }),
}).strict();
export const planActionSchema = z.object({ action: z.enum(["approve", "cancel"]) }).strict();

export async function listPlans(context: AuthorizationContext, customerId?: string, page = 1) {
  requireCapability(context, "plans.read");
  return db.relationshipPlan.findMany({ where: { tenantId: context.tenantId, customerId }, include: { customer: { select: { fullName: true } } }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 50, skip: (page - 1) * 50 });
}

export async function createPlan(context: AuthorizationContext, input: z.infer<typeof createPlanSchema>) {
  requireCapability(context, "plans.manage");
  const data = createPlanSchema.parse(input);
  const existing = await db.relationshipPlan.findUnique({ where: { tenantId_requestKey: { tenantId: context.tenantId, requestKey: data.requestKey } } });
  if (existing) {
    if (existing.customerId !== data.customerId || existing.purpose !== data.purpose || existing.message !== data.message || existing.channel !== data.channel || existing.scheduledAt.getTime() !== new Date(data.scheduledAt).getTime()) throw new ConflictError("Request key was already used for a different plan");
    return existing;
  }
  if (new Date(data.scheduledAt) <= new Date()) throw new ConflictError("Schedule the plan in the future");
  return db.$transaction(async (transaction) => {
    // Prisma's empty-update upsert can race on a missing row; lock the request first.
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${data.requestKey}`}, 0))`;
    const customer = await transaction.customer.findFirst({ where: { id: data.customerId, tenantId: context.tenantId, status: "ACTIVE" } });
    if (!customer) throw new NotFoundError();
    const plan = await transaction.relationshipPlan.upsert({
      where: { tenantId_requestKey: { tenantId: context.tenantId, requestKey: data.requestKey } },
      create: { ...data, scheduledAt: new Date(data.scheduledAt), tenantId: context.tenantId, createdById: context.userId }, update: {},
    });
    if (plan.customerId !== data.customerId || plan.message !== data.message || plan.purpose !== data.purpose || plan.channel !== data.channel || plan.scheduledAt.getTime() !== new Date(data.scheduledAt).getTime()) throw new ConflictError("Request key was already used for a different plan");
    await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: "RELATIONSHIP_PLAN_CREATED", entityType: "RelationshipPlan", entityId: plan.id, metadata: { customerId: plan.customerId, channel: plan.channel }, idempotencyKey: `plan-created:${plan.id}` });
    return plan;
  });
}

export async function changePlan(context: AuthorizationContext, id: string, action: "approve" | "cancel") {
  requireCapability(context, action === "approve" ? "plans.approve" : "plans.manage");
  return db.$transaction(async (transaction) => {
    const plan = await transaction.relationshipPlan.findFirst({ where: { id, tenantId: context.tenantId } });
    if (!plan) throw new NotFoundError();
    const target = action === "approve" ? "APPROVED" : "CANCELLED";
    if (plan.status === target) return plan;
    if (action === "approve" && !await transaction.customer.findFirst({ where: { id: plan.customerId, tenantId: context.tenantId, status: "ACTIVE" } })) throw new ConflictError("Customer is no longer active");
    const now = new Date();
    const updated = await transaction.relationshipPlan.updateMany({
      where: { id, tenantId: context.tenantId, status: action === "approve" ? "DRAFT" : { in: ["DRAFT", "APPROVED"] } },
      data: action === "approve" ? { status: target, approvedById: context.userId, approvedAt: now } : { status: target, cancelledAt: now },
    });
    if (updated.count !== 1) {
      const current = await transaction.relationshipPlan.findUniqueOrThrow({ where: { id_tenantId: { id, tenantId: context.tenantId } } });
      if (current.status === target) return current;
      throw new ConflictError("Plan state no longer allows this action");
    }
    await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: `RELATIONSHIP_PLAN_${target}`, entityType: "RelationshipPlan", entityId: id, metadata: { customerId: plan.customerId }, idempotencyKey: `plan-${target.toLowerCase()}:${id}` });
    return transaction.relationshipPlan.findUniqueOrThrow({ where: { id_tenantId: { id, tenantId: context.tenantId } } });
  });
}
