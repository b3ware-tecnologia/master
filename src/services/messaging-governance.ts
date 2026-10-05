import { z } from "zod";
import type { CommunicationChannel, CommunicationConsent, RelationshipPlanStatus } from "@prisma/client";
import type { AuthorizationContext } from "@/domain/access";
import { NotFoundError } from "@/domain/errors";
import { requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { recordEvent } from "@/services/events";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";
import { lockMessagingTarget } from "@/services/messaging-locks";
type GovernanceActor = AuthorizationContext | CRMActor;
function actor(input: GovernanceActor): CRMActor { return "userId" in input ? { tenantId: input.tenantId, context: input } : input; }
function actorId(input: GovernanceActor) { const value = actor(input); return "context" in value ? value.context.userId : value.platformUserId; }

const channelSchema = z.enum(["WHATSAPP", "EMAIL", "PHONE"]);
export const consentSchema = z.object({ channel: channelSchema, consent: z.enum(["UNKNOWN", "OPTED_IN", "OPTED_OUT"]), evidence: z.string().trim().min(10).max(1000) }).strict();
export const policySchema = z.object({
  timeZone: z.string().refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Invalid time zone"),
  startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24),
  minIntervalMinutes: z.number().int().min(0).max(10080), enabledChannels: z.array(channelSchema).max(3),
}).strict().refine((policy) => policy.endHour > policy.startHour, "End hour must follow start hour").refine((policy) => new Set(policy.enabledChannels).size === policy.enabledChannels.length, "Duplicate channel");

export type GovernanceInput = {
  now: Date; status: RelationshipPlanStatus; approvedAt: Date | null; scheduledAt: Date;
  channel: CommunicationChannel; customerActive: boolean; recipientAvailable: boolean;
  consent?: CommunicationConsent; lastOutboundAt: Date | null;
  policy?: z.infer<typeof policySchema> | null;
};
export function evaluateEligibility(input: GovernanceInput) {
  const reasons: string[] = [];
  if (input.status !== "APPROVED" || !input.approvedAt) reasons.push("PLAN_NOT_APPROVED");
  if (!input.customerActive) reasons.push("CUSTOMER_INACTIVE");
  if (!input.recipientAvailable) reasons.push("RECIPIENT_MISSING");
  if (input.consent !== "OPTED_IN") reasons.push(input.consent === "OPTED_OUT" ? "CUSTOMER_OPTED_OUT" : "CONSENT_REQUIRED");
  if (input.scheduledAt > input.now) reasons.push("NOT_DUE");
  if (!input.policy) reasons.push("POLICY_REQUIRED");
  else {
    if (!input.policy.enabledChannels.includes(input.channel)) reasons.push("CHANNEL_DISABLED");
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: input.policy.timeZone, hour: "2-digit", hourCycle: "h23" }).format(input.now));
    if (hour < input.policy.startHour || hour >= input.policy.endHour) reasons.push("OUTSIDE_CONTACT_WINDOW");
    if (input.lastOutboundAt && input.now.getTime() - input.lastOutboundAt.getTime() < input.policy.minIntervalMinutes * 60000) reasons.push("CONTACT_COOLDOWN");
  }
  return { eligible: reasons.length === 0, reasons };
}

export async function saveCommunicationPreference(context: GovernanceActor, customerId: string, value: z.infer<typeof consentSchema>) {
  const input = consentSchema.parse(value);
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor(context), "messaging.manage");
    await lockMessagingTarget(transaction, context.tenantId, customerId);
    if (!await transaction.customer.findFirst({ where: { id: customerId, tenantId: context.tenantId } })) throw new NotFoundError();
    const preference = await transaction.communicationPreference.upsert({ where: { tenantId_customerId_channel: { tenantId: context.tenantId, customerId, channel: input.channel } }, create: { ...input, tenantId: context.tenantId, customerId, recordedById: actorId(context) }, update: { ...input, recordedById: actorId(context) } });
    await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: actorId(context), action: "COMMUNICATION_CONSENT_RECORDED", entityType: "Customer", entityId: customerId, metadata: { channel: input.channel, consent: input.consent } });
    return preference;
  });
}
export async function saveMessagingPolicy(context: GovernanceActor, value: z.infer<typeof policySchema>) {
  const input = policySchema.parse(value);
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor(context), "messaging.manage");
    await lockMessagingTarget(transaction, context.tenantId);
    const policy = await transaction.messagingPolicy.upsert({ where: { tenantId: context.tenantId }, create: { ...input, tenantId: context.tenantId }, update: input });
    await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: actorId(context), action: "MESSAGING_POLICY_UPDATED", entityType: "MessagingPolicy", entityId: policy.id });
    return policy;
  });
}
export async function outboundGovernanceSetup(current: CRMActor, customerId?: string) {
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, current, "messaging.manage");
    if (customerId && !await transaction.customer.findFirst({ where: { id: customerId, tenantId: current.tenantId } })) throw new NotFoundError();
    return { policy: await transaction.messagingPolicy.findUnique({ where: { tenantId: current.tenantId } }), preference: customerId ? await transaction.communicationPreference.findUnique({ where: { tenantId_customerId_channel: { tenantId: current.tenantId, customerId, channel: "WHATSAPP" } } }) : null };
  });
}
export async function checkPlanGovernance(context: AuthorizationContext, planId: string) {
  requireCapability(context, "messaging.read");
  return db.$transaction(async (transaction) => {
    const plan = await transaction.relationshipPlan.findFirst({ where: { id: planId, tenantId: context.tenantId }, include: { customer: { include: { identifiers: true } } } });
    if (!plan) throw new NotFoundError();
    const [policy, preference] = await Promise.all([
      transaction.messagingPolicy.findUnique({ where: { tenantId: context.tenantId } }),
      transaction.communicationPreference.findUnique({ where: { tenantId_customerId_channel: { tenantId: context.tenantId, customerId: plan.customerId, channel: plan.channel } } }),
    ]);
    const identifierType = plan.channel === "EMAIL" ? "EMAIL" : "PHONE";
    const recipientAvailable = plan.customer.identifiers.some((identifier) => identifier.type === identifierType && (identifierType === "PHONE" ? /^\d{10,13}$/.test(identifier.normalizedValue) : z.email().safeParse(identifier.normalizedValue).success));
    const result = evaluateEligibility({ now: new Date(), status: plan.status, approvedAt: plan.approvedAt, scheduledAt: plan.scheduledAt, channel: plan.channel, customerActive: plan.customer.status === "ACTIVE", recipientAvailable, consent: preference?.consent, lastOutboundAt: plan.customer.lastOutboundAt, policy });
    const check = await transaction.messagingGovernanceCheck.create({ data: { ...result, tenantId: context.tenantId, planId, evaluatedById: context.userId, planUpdatedAt: plan.updatedAt, policyUpdatedAt: policy?.updatedAt, consentUpdatedAt: preference?.updatedAt } });
    await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: "MESSAGING_GOVERNANCE_CHECKED", entityType: "RelationshipPlan", entityId: planId, metadata: { checkId: check.id, eligible: result.eligible, reasons: result.reasons } });
    return check;
  }, { isolationLevel: "RepeatableRead" });
}
