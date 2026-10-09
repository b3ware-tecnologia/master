import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { decisionSchema } from "@/domain/commercial";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { db } from "@/lib/db";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";
import { commercialActorId, commercialCustomerScope } from "@/services/commercial-service";
import { lockMessagingTarget, lockCRMCustomer } from "@/services/messaging-locks";
import { recordEvent } from "@/services/events";
import type { outreachSource } from "@/services/outreach-authority";

export async function applyCommercialDecision(tx: Prisma.TransactionClient, source: Awaited<ReturnType<typeof outreachSource>>, turnId: string, value: z.infer<typeof decisionSchema>) {
  const decision = decisionSchema.parse(value);
  if (!source.input.messages.some((m) => m.direction === "INBOUND")) return;
  const { session, campaign } = source;
  if ((await tx.outreachSession.findUniqueOrThrow({ where: { id: session.id } })).control !== "AI") throw new ConflictError("HUMAN_CONTROL");
  let opportunity = await tx.opportunity.findUnique({ where: { sessionId: session.id } });
  if (opportunity && ["WON", "LOST", "DO_NOT_CONTACT"].includes(opportunity.stage)) throw new ConflictError("OPPORTUNITY_CLOSED");
  const handoff = decision.handoff || ["INTEREST", "HUMAN_REQUEST", "COMPLAINT"].includes(decision.intent);
  const stage = decision.intent === "OPT_OUT" ? "DO_NOT_CONTACT" : decision.intent === "NOT_INTERESTED" ? "NOT_INTERESTED" : decision.intent === "WRONG_NUMBER" ? "LOST" : handoff ? "HUMAN_HANDOFF" : decision.intent === "BUSY" || decision.followUpAt ? "FOLLOW_UP" : decision.intent === "QUALIFIED" ? "QUALIFIED" : "AI_CONVERSATION";
  const data = { stage, summary: decision.summary, lastIntent: decision.intent, productId: decision.productId, ...(handoff ? { handoffAt: new Date() } : {}) };
  if (decision.productId && !await tx.creditProduct.findFirst({ where: { id: decision.productId, tenantId: session.tenantId, status: "ACTIVE" } })) throw new ConflictError("PRODUCT_CHANGED");
  opportunity = opportunity ? await tx.opportunity.update({ where: { id: opportunity.id }, data: { ...data, version: { increment: 1 } } }) : await tx.opportunity.create({ data: { ...data, tenantId: session.tenantId, customerId: session.customerId, campaignId: campaign.id, conversationId: session.conversationId, sessionId: session.id } });
  if (decision.followUpAt) await tx.opportunityTask.upsert({ where: { opportunityId_sourceKey: { opportunityId: opportunity.id, sourceKey: `ai:${turnId}` } }, create: { tenantId: session.tenantId, opportunityId: opportunity.id, sourceKey: `ai:${turnId}`, dueAt: new Date(decision.followUpAt), reason: decision.followUpReason ?? "Retorno solicitado na conversa.", status: "PENDING_REVIEW", createdById: campaign.authorizedById }, update: {} });
  await recordEvent(tx, { tenantId: session.tenantId, actorUserId: campaign.authorizedById ?? undefined, action: "CONCIERGE_DECISION_APPLIED", entityType: "Opportunity", entityId: opportunity.id, metadata: { turnId, intent: decision.intent, stage, handoff, followUpProposed: !!decision.followUpAt }, idempotencyKey: `concierge:${turnId}` });
}
const taskActionSchema = z.strictObject({ action: z.enum(["create", "approve", "cancel", "complete"]), expectedVersion: z.number().int().min(0), taskId: z.string().min(1).max(100).optional(), dueAt: z.iso.datetime({ offset: true }).optional(), reason: z.string().trim().min(5).max(1000).optional() }).refine((v) => v.action === "create" || !!v.taskId, "Identifique o retorno a alterar.");
export async function changeOpportunityTask(actor: CRMActor, opportunityId: string, value: unknown) {
  const input = taskActionSchema.parse(value);
  return db.$transaction(async (tx) => {
    await authorizeCRMActor(tx, actor, "crm.update"); const before = await tx.opportunity.findFirst({ where: { id: opportunityId, tenantId: actor.tenantId, customer: commercialCustomerScope(actor) } }); if (!before) throw new NotFoundError();
    await lockCRMCustomer(tx, actor.tenantId, before.customerId);
    await lockMessagingTarget(tx, actor.tenantId, before.customerId);
    const item = await tx.opportunity.findFirst({ where: { id: opportunityId, tenantId: actor.tenantId, customer: commercialCustomerScope(actor) } }); if (!item || item.stage === "DO_NOT_CONTACT") throw new ConflictError("Contato bloqueado ou redistribuído.");
    if (input.dueAt && new Date(input.dueAt) <= new Date()) throw new ConflictError("Escolha uma data futura.");
    let task;
    if (input.action === "create") { if (!input.dueAt || !input.reason) throw new ConflictError("Data e motivo são obrigatórios."); task = await tx.opportunityTask.create({ data: { tenantId: actor.tenantId, opportunityId, dueAt: new Date(input.dueAt), reason: input.reason, sourceKey: `manual:${randomUUID()}`, status: "PENDING_REVIEW", createdById: commercialActorId(actor) } }); }
    else {
      const old = await tx.opportunityTask.findFirst({ where: { id: input.taskId, tenantId: actor.tenantId, opportunityId, version: input.expectedVersion, status: { in: ["PENDING_REVIEW", "SCHEDULED", "QUEUED"] } } }); if (!old) throw new ConflictError("O retorno mudou ou já foi encerrado.");
      if (input.action === "approve") {
        await authorizeCRMActor(tx, actor, "plans.approve");
        const session = item.sessionId ? await tx.outreachSession.findFirst({ where: { id: item.sessionId, tenantId: actor.tenantId }, include: { campaign: true } }) : null;
        if (old.status !== "PENDING_REVIEW" || !session || session.control !== "AI" || session.campaign.status !== "ACTIVE" || !session.campaign.authorizedAt || old.dueAt <= new Date() || old.dueAt >= session.campaign.endsAt) throw new ConflictError("O retorno exige revisão pendente, campanha autorizada, controle da IA e data futura dentro da validade.");
      }
      task = await tx.opportunityTask.update({ where: { id: old.id }, data: { status: input.action === "approve" ? "SCHEDULED" : input.action === "cancel" ? "CANCELLED" : "COMPLETED", version: { increment: 1 } } });
      if (input.action !== "approve" && item.sessionId) await tx.outreachTurn.updateMany({ where: { sessionId: item.sessionId, sourceKey: { startsWith: `task:${old.id}:` }, status: { in: ["QUEUED", "RUNNING", "READY"] } }, data: { status: "CANCELLED", lockToken: null } });
    }
    await recordEvent(tx, { tenantId: actor.tenantId, actorUserId: commercialActorId(actor), action: "OPPORTUNITY_FOLLOWUP_CHANGED", entityType: "OpportunityTask", entityId: task.id, metadata: { action: input.action, status: task.status } }); return task;
  });
}
export async function processCommercialFollowUps() {
  const jobs = await db.opportunityTask.findMany({ where: { status: "SCHEDULED", dueAt: { lte: new Date() }, opportunity: { session: { control: "AI", campaign: { status: "ACTIVE", endsAt: { gt: new Date() } } } } }, take: 20 });
  for (const job of jobs) await db.$transaction(async (tx) => {
    const before = await tx.opportunity.findUniqueOrThrow({ where: { id: job.opportunityId } });
    await lockMessagingTarget(tx, job.tenantId, before.customerId);
    const item = await tx.opportunity.findUniqueOrThrow({ where: { id: job.opportunityId }, include: { session: { include: { campaign: true } } } });
    if (!item.sessionId || item.session?.control !== "AI" || item.session.campaign.status !== "ACTIVE" || item.session.campaign.endsAt <= new Date() || ["WON", "LOST", "DO_NOT_CONTACT"].includes(item.stage)) return;
    if (!(await tx.opportunityTask.updateMany({ where: { id: job.id, status: "SCHEDULED", version: job.version }, data: { status: "QUEUED" } })).count) return;
    await tx.outreachTurn.upsert({ where: { sessionId_sourceKey: { sessionId: item.sessionId, sourceKey: `task:${job.id}:${job.version}` } }, create: { tenantId: job.tenantId, sessionId: item.sessionId, sourceKey: `task:${job.id}:${job.version}`, kind: "FOLLOWUP" }, update: {} });
  });
}
