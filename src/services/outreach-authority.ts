import { createHash } from "node:crypto";
import type { OutreachCampaign, Prisma } from "@prisma/client";
import { roleCapabilities, roleAccessScope } from "@/domain/access";
import { ConflictError } from "@/domain/errors";
import type { OutreachInput } from "@/domain/outreach";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";
import { currentCreditKnowledge } from "@/services/commercial-service";
import { playbookInterpretationSchema } from "@/domain/commercial";

export const outreachEnabled = () => process.env.AI_OUTREACH_ENABLED === "true";
export async function campaignActor(transaction: Prisma.TransactionClient, campaign: OutreachCampaign): Promise<CRMActor> {
  if (!campaign.authorizedById || !campaign.authorizedAt) throw new ConflictError("CAMPAIGN_NOT_AUTHORIZED");
  let actor: CRMActor = { tenantId: campaign.tenantId, platformUserId: campaign.authorizedById };
  if (campaign.authorizedMemberId) {
    const membership = await transaction.membership.findUniqueOrThrow({ where: { id: campaign.authorizedMemberId } });
    actor = { tenantId: campaign.tenantId, context: { userId: campaign.authorizedById, membershipId: membership.id, tenantId: campaign.tenantId, role: membership.role, accessScope: roleAccessScope[membership.role], capabilities: roleCapabilities[membership.role] } };
  }
  await authorizeCRMActor(transaction, actor, "plans.approve");
  await authorizeCRMActor(transaction, actor, "messaging.send");
  return actor;
}
export async function outreachSource(transaction: Prisma.TransactionClient, sessionId: string, tenantId: string, kind: string) {
  const session = await transaction.outreachSession.findFirst({ where: { id: sessionId, tenantId }, include: { opportunity: true, campaign: { include: { playbook: true, connection: true, list: true } }, customer: { include: { facts: { where: { verification: "CONFIRMED", key: { in: ["city", "occupation", "interest", "goal", "cidade", "profissao", "objetivo"] } }, orderBy: { id: "asc" }, take: 20 } } } } });
  if (!session) throw new ConflictError("SESSION_NOT_FOUND");
  const campaign = session.campaign; const actor = await campaignActor(transaction, campaign); const now = new Date();
  if (campaign.status !== "ACTIVE" || now < campaign.startsAt || now >= campaign.endsAt || session.control !== "AI" || session.customer.status !== "ACTIVE" || !campaign.connection.enabled || campaign.list.status === "ARCHIVED") throw new ConflictError("AUTOMATION_PAUSED");
  const member = await transaction.customerListMember.findFirst({ where: { tenantId, listId: campaign.listId, customerId: session.customerId, createdAt: { lte: campaign.authorizedAt! } } });
  if (!member) throw new ConflictError("AUDIENCE_CHANGED");
  if (campaign.playbookRequired && campaign.playbook?.status !== "APPROVED") throw new ConflictError("PLAYBOOK_NOT_APPROVED");
  const messages = session.conversationId ? await transaction.conversationMessage.findMany({ where: { tenantId, conversationId: session.conversationId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 30, select: { id: true, direction: true, text: true, kind: true } }) : [];
  const prior = await transaction.outreachTurn.findMany({ where: { sessionId, tenantId, status: "SENT" }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, message: true } });
  const input: OutreachInput = { objective: campaign.objective, stage: kind, customer: { firstName: session.customer.fullName.split(" ")[0].slice(0, 60), facts: session.customer.facts.map(({ id, key, value }) => ({ id, key, value: value.slice(0, 300) })) }, messages: [...prior.reverse().map((item) => ({ id: item.id, direction: "OUTBOUND", text: item.message, kind: "TEXT" })), ...messages.reverse().map((item) => ({ ...item, text: item.text?.slice(0, 2000) ?? null }))] };
  if (campaign.playbook) { input.playbook = playbookInterpretationSchema.parse(campaign.playbook.interpretation); input.memory = session.opportunity?.summary ?? ""; input.knowledge = await currentCreditKnowledge(transaction, tenantId); input.expiresAt = campaign.endsAt.toISOString(); }
  const fingerprint = createHash("sha256").update(JSON.stringify({ input, sessionVersion: session.version, campaignVersion: campaign.version, memberId: member.id })).digest("hex");
  input.now = new Date().toISOString();
  return { session, campaign, actor, input, fingerprint };
}
export async function assertAutomatedPlan(transaction: Prisma.TransactionClient, planId: string, enabled = outreachEnabled()) {
  const turn = await transaction.outreachTurn.findUnique({ where: { planId } });
  if (!turn) return;
  if (!enabled) throw new ConflictError("AI_OUTREACH_DISABLED");
  const source = await outreachSource(transaction, turn.sessionId, turn.tenantId, turn.kind);
  if (turn.status !== "READY" || source.fingerprint !== turn.fingerprint) throw new ConflictError("AUTOMATION_CONTEXT_CHANGED");
  if (turn.sourceKey.startsWith("task:")) {
    const [, id, version] = turn.sourceKey.split(":");
    if (!id || !version || !await transaction.opportunityTask.findFirst({ where: { id, tenantId: turn.tenantId, version: Number(version), status: "QUEUED", dueAt: { lte: new Date() }, opportunity: { sessionId: turn.sessionId } } })) throw new ConflictError("FOLLOWUP_CANCELLED");
  }
  return source;
}
