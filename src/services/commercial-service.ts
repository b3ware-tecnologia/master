import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { catalogCreateSchema, conditionTermsSchema, playbookCreateSchema, playbookActionSchema, playbookInterpretationSchema, cadenceSchema, stages, outreachScore } from "@/domain/commercial";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { db } from "@/lib/db";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";
import { customerScope } from "@/services/customer-scope";
import { recordEvent } from "@/services/events";
import { lockMessagingTarget, lockCRMCustomer } from "@/services/messaging-locks";
import { jevConfiguration } from "@/integrations/jev";
import { aiConfiguration } from "@/integrations/ai-gateway";
import { commercialAIJobInputSchema } from "@/domain/agent-simulation";

export const commercialActorId = (actor: CRMActor) => "context" in actor ? actor.context.userId : actor.platformUserId;
export const commercialCustomerScope = (actor: CRMActor) => "context" in actor ? customerScope(actor.context) : { tenantId: actor.tenantId };
export async function listCommercial(actor: CRMActor) {
  return db.$transaction(async (tx) => {
    await authorizeCRMActor(tx, actor, "crm.read");
    const customer = commercialCustomerScope(actor); const canManage = !("context" in actor) || actor.context.capabilities.includes("plans.manage");
    const [opportunities, stageCounts, counts, playbooks, institutions, products, conditions, jobs, connections, contacts] = await Promise.all([
      tx.opportunity.findMany({ where: { tenantId: actor.tenantId, customer }, take: 150, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { customer: { select: { id: true, fullName: true, crmCases: { select: { id: true }, orderBy: { updatedAt: "desc" }, take: 1 }, assignment: { include: { assignedMembership: { include: { user: { select: { name: true } } } } } } } }, campaign: { select: { name: true } }, tasks: { where: { status: { in: ["PENDING_REVIEW", "SCHEDULED"] } }, orderBy: { dueAt: "asc" } }, session: { select: { id: true, control: true, version: true } } } }),
      tx.opportunity.groupBy({ by: ["stage"], where: { tenantId: actor.tenantId, customer }, _count: true }),
      Promise.all([tx.customer.count({ where: customer }), tx.customer.count({ where: { ...customer, lastOutboundAt: { not: null } } }), tx.customer.count({ where: { ...customer, lastInboundAt: { not: null } } }), tx.opportunity.count({ where: { tenantId: actor.tenantId, customer } })]),
      canManage ? tx.campaignPlaybook.findMany({ where: { tenantId: actor.tenantId }, orderBy: { updatedAt: "desc" }, take: 100 }) : [],
      tx.financialInstitution.findMany({ where: { tenantId: actor.tenantId, status: "ACTIVE" }, take: 100, orderBy: { name: "asc" } }),
      tx.creditProduct.findMany({ where: { tenantId: actor.tenantId }, include: { institution: { select: { name: true } } }, take: 200 }),
      tx.creditCondition.findMany({ where: { tenantId: actor.tenantId, ...(canManage ? {} : { status: "PUBLISHED", validFrom: { lte: new Date() }, validUntil: { gt: new Date() } }) }, take: 200, orderBy: { updatedAt: "desc" } }),
      tx.commercialAIJob.findMany({ where: { tenantId: actor.tenantId, requestedById: commercialActorId(actor) }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, kind: true, entityId: true, status: true, result: true, errorCode: true, createdAt: true } }),
      canManage ? tx.messagingConnection.findMany({ where: { tenantId: actor.tenantId }, include: { cadence: true }, take: 100 }) : [],
      tx.customer.findMany({ where: customer, take: 100, orderBy: { createdAt: "desc" }, include: { identifiers: { where: { type: "PHONE" } }, sources: { take: 1 }, listMembers: { take: 1, include: { list: { select: { name: true } } } }, facts: { where: { key: { in: ["previousRelationship", "relacionamento_anterior"] }, verification: "CONFIRMED" }, take: 1 } } }),
    ]);
    return { configuration: aiConfiguration(), jev: jevConfiguration(), canManage, canUpdate: !("context" in actor) || actor.context.capabilities.includes("crm.update"), opportunities, stageCounts, counts: { imported: counts[0], contacted: counts[1], responded: counts[2], opportunities: counts[3] }, playbooks, institutions, products, conditions, jobs, connections, contacts: contacts.map((item) => ({ id: item.id, name: item.fullName, status: item.status, relationshipState: item.relationshipState, phone: item.identifiers[0]?.normalizedValue ?? null, origin: item.listMembers[0]?.list.name ?? "Cadastro", lastAttempt: item.lastOutboundAt, score: outreachScore({ validPhone: item.identifiers.some((p) => /^[1-9]\d{9,14}$/.test(p.normalizedValue) && !["REJECTED", "EXPIRED"].includes(p.verification)), confirmedPhone: item.identifiers.some((p) => p.verification === "CONFIRMED"), hasName: !!item.fullName, previousRelationship: item.facts.some((f) => /^(true|sim|yes|1)$/i.test(f.value)), responded: !!item.lastInboundAt, lastContactAt: item.lastContactAt }) })), limits: { opportunityCards: 150, contacts: 100, conditions: 200 } };
  });
}
export async function createPlaybook(actor: CRMActor, value: unknown) {
  const input = playbookCreateSchema.parse(value);
  return db.$transaction(async (tx) => { await authorizeCRMActor(tx, actor, "plans.manage"); const item = await tx.campaignPlaybook.create({ data: { ...input, tenantId: actor.tenantId, createdById: commercialActorId(actor) } }); await recordEvent(tx, { tenantId: actor.tenantId, actorUserId: commercialActorId(actor), action: "PLAYBOOK_CREATED", entityType: "CampaignPlaybook", entityId: item.id }); return item; });
}
export async function changePlaybook(actor: CRMActor, id: string, value: unknown) {
  const input = playbookActionSchema.parse(value);
  return db.$transaction(async (tx) => {
    await authorizeCRMActor(tx, actor, input.action === "approve" ? "plans.approve" : "plans.manage");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`playbook:${actor.tenantId}:${id}`}, 0))`;
    const item = await tx.campaignPlaybook.findFirst({ where: { id, tenantId: actor.tenantId } }); if (!item) throw new NotFoundError();
    if (item.version !== input.expectedVersion || item.status === "APPROVED") throw new ConflictError("A versão aprovada é imutável. Crie uma nova estratégia para alterar a operação.");
    if (input.action === "approve") playbookInterpretationSchema.parse(item.interpretation);
    const updated = await tx.campaignPlaybook.update({ where: { id }, data: input.action === "approve" ? { status: "APPROVED", approvedById: commercialActorId(actor), approvedAt: new Date(), version: { increment: 1 } } : { instruction: input.instruction, interpretation: input.interpretation ?? Prisma.JsonNull, status: "DRAFT", version: { increment: 1 } } });
    await recordEvent(tx, { tenantId: actor.tenantId, actorUserId: commercialActorId(actor), action: `PLAYBOOK_${input.action.toUpperCase()}`, entityType: "CampaignPlaybook", entityId: id, metadata: { version: updated.version } }); return updated;
  });
}
export async function createCatalog(actor: CRMActor, value: unknown) {
  const input = catalogCreateSchema.parse(value);
  return db.$transaction(async (tx) => {
    await authorizeCRMActor(tx, actor, "settings.update"); let item: { id: string };
    if (input.kind === "institution") item = await tx.financialInstitution.create({ data: { tenantId: actor.tenantId, name: input.name, source: input.source } });
    else if (input.kind === "product") { if (!await tx.financialInstitution.findFirst({ where: { id: input.institutionId, tenantId: actor.tenantId, status: "ACTIVE" } })) throw new NotFoundError(); item = await tx.creditProduct.create({ data: { tenantId: actor.tenantId, institutionId: input.institutionId, name: input.name, kind: input.productKind, description: input.description } }); }
    else { if (!await tx.creditProduct.findFirst({ where: { id: input.productId, tenantId: actor.tenantId, status: "ACTIVE" } })) throw new NotFoundError(); const { kind: _kind, ...data } = input; void _kind; item = await tx.creditCondition.create({ data: { ...data, tenantId: actor.tenantId, validFrom: new Date(input.validFrom), validUntil: new Date(input.validUntil) } }); }
    await recordEvent(tx, { tenantId: actor.tenantId, actorUserId: commercialActorId(actor), action: "FINANCIAL_CATALOG_CREATED", entityType: input.kind, entityId: item.id }); return item;
  });
}
export async function publishCondition(actor: CRMActor, id: string, expectedVersion: number, confirmed: boolean, archive = false) {
  z.number().int().min(0).parse(expectedVersion); if (confirmed !== true) throw new ConflictError("Confira a fonte, os requisitos e a vigência antes de publicar.");
  return db.$transaction(async (tx) => {
    await authorizeCRMActor(tx, actor, "settings.update"); const item = await tx.creditCondition.findFirst({ where: { id, tenantId: actor.tenantId, version: expectedVersion } }); if (!item) throw new ConflictError("A condição mudou.");
    if (!archive && (item.status !== "DRAFT" || item.validUntil <= new Date())) throw new ConflictError("Crie uma nova versão vigente."); conditionTermsSchema.parse(item.terms);
    const updated = await tx.creditCondition.updateMany({ where: { id, tenantId: actor.tenantId, version: expectedVersion }, data: { status: archive ? "ARCHIVED" : "PUBLISHED", publishedById: commercialActorId(actor), publishedAt: new Date(), version: { increment: 1 } } }); if (!updated.count) throw new ConflictError("A condição mudou.");
    await recordEvent(tx, { tenantId: actor.tenantId, actorUserId: commercialActorId(actor), action: archive ? "CREDIT_CONDITION_ARCHIVED" : "CREDIT_CONDITION_PUBLISHED", entityType: "CreditCondition", entityId: id, metadata: { version: expectedVersion + 1 } }); return { id };
  });
}
export async function currentCreditKnowledge(tx: Prisma.TransactionClient, tenantId: string, now = new Date()) {
  const conditions = await tx.creditCondition.findMany({ where: { tenantId, status: "PUBLISHED", validFrom: { lte: now }, validUntil: { gt: now }, product: { status: "ACTIVE", institution: { status: "ACTIVE" } } }, include: { product: { include: { institution: { select: { name: true } } } } }, orderBy: { updatedAt: "desc" }, take: 30 });
  return conditions.map((item) => ({ id: item.id, productId: item.productId, product: item.product.name, kind: item.product.kind, institution: item.product.institution.name, agreement: item.agreement, terms: conditionTermsSchema.parse(item.terms), disclosure: item.disclosure, source: item.source, validUntil: item.validUntil.toISOString() }));
}
const opportunityAction = z.strictObject({ expectedVersion: z.number().int().min(0), stage: z.enum(stages), note: z.string().trim().min(5).max(2000) });
export async function moveOpportunity(actor: CRMActor, id: string, value: unknown) {
  const input = opportunityAction.parse(value);
  return db.$transaction(async (tx) => {
    await authorizeCRMActor(tx, actor, "crm.update"); const before = await tx.opportunity.findFirst({ where: { id, tenantId: actor.tenantId, customer: commercialCustomerScope(actor) } }); if (!before) throw new NotFoundError();
    await lockCRMCustomer(tx, actor.tenantId, before.customerId);
    await lockMessagingTarget(tx, actor.tenantId, before.customerId);
    const item = await tx.opportunity.findFirst({ where: { id, tenantId: actor.tenantId, customer: commercialCustomerScope(actor), version: input.expectedVersion } }); if (!item) throw new ConflictError("A oportunidade mudou ou foi redistribuída.");
    if (item.stage === "DO_NOT_CONTACT" || input.stage === "DO_NOT_CONTACT") throw new ConflictError("Use o bloqueio de contato para registrar consentimento; não altere este estado pelo Kanban.");
    if (item.sessionId) { await tx.outreachSession.update({ where: { id: item.sessionId }, data: { control: "HUMAN", version: { increment: 1 }, handoffReason: "HUMAN_STAGE_CHANGE" } }); await tx.outreachTurn.updateMany({ where: { sessionId: item.sessionId, status: { in: ["QUEUED", "RUNNING", "READY"] } }, data: { status: "CANCELLED", lockToken: null } }); }
    await tx.outboundDispatch.updateMany({ where: { tenantId: actor.tenantId, customerId: item.customerId, status: "QUEUED", plan: { outreachTurn: { isNot: null } } }, data: { status: "CANCELLED", version: { increment: 1 } } });
    const result = await tx.opportunity.update({ where: { id }, data: { stage: input.stage, version: { increment: 1 }, closedAt: ["WON", "LOST", "NOT_INTERESTED"].includes(input.stage) ? new Date() : null } });
    await tx.customerTimeline.create({ data: { tenantId: actor.tenantId, customerId: item.customerId, actorId: commercialActorId(actor), eventType: "OPPORTUNITY_STAGE", summary: input.note, metadata: { opportunityId: id, from: item.stage, to: input.stage } } });
    await recordEvent(tx, { tenantId: actor.tenantId, actorUserId: commercialActorId(actor), action: "OPPORTUNITY_STAGE_CHANGED", entityType: "Opportunity", entityId: id, metadata: { from: item.stage, to: input.stage, version: result.version } }); return result;
  });
}
export async function saveChannelCadence(actor: CRMActor, connectionId: string, value: unknown) {
  const input = cadenceSchema.parse(value);
  return db.$transaction(async (tx) => { await authorizeCRMActor(tx, actor, "messaging.manage"); await lockMessagingTarget(tx, actor.tenantId); if (!await tx.messagingConnection.findFirst({ where: { id: connectionId, tenantId: actor.tenantId } })) throw new NotFoundError(); const item = await tx.channelCadence.upsert({ where: { connectionId }, create: { ...input, tenantId: actor.tenantId, connectionId }, update: input }); await recordEvent(tx, { tenantId: actor.tenantId, actorUserId: commercialActorId(actor), action: "CHANNEL_CADENCE_UPDATED", entityType: "MessagingConnection", entityId: connectionId }); return item; });
}
export async function enqueueCommercialJob(actor: CRMActor, value: unknown) {
  const input = commercialAIJobInputSchema.parse(value); const inputHash = createHash("sha256").update(JSON.stringify({ input, actor: commercialActorId(actor) })).digest("hex");
  return db.$transaction(async (tx) => {
    await authorizeCRMActor(tx, actor, input.kind === "COPILOT" ? "crm.update" : "plans.manage");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial-job:${actor.tenantId}:${input.requestKey}`}, 0))`;
    const old = await tx.commercialAIJob.findUnique({ where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: input.requestKey } } }); if (old) { if (old.inputHash !== inputHash) throw new ConflictError("Solicitação usada com outros dados."); return { id: old.id, status: old.status }; }
    if (input.kind === "COPILOT") { if (!await tx.opportunity.findFirst({ where: { id: input.entityId, tenantId: actor.tenantId, customer: commercialCustomerScope(actor) } })) throw new NotFoundError(); }
    else if (!await tx.campaignPlaybook.findFirst({ where: { id: input.entityId, tenantId: actor.tenantId, ...(input.kind === "TEST_AGENT" ? { status: "APPROVED" } : { status: { not: "APPROVED" } }) } })) throw new NotFoundError();
    if (await tx.commercialAIJob.count({ where: { tenantId: actor.tenantId, createdAt: { gt: new Date(Date.now() - 3600_000) } } }) >= 20) throw new ConflictError("Limite de vinte testes/interpretações por hora atingido.");
    const item = await tx.commercialAIJob.create({ data: { tenantId: actor.tenantId, requestedById: commercialActorId(actor), membershipId: "context" in actor ? actor.context.membershipId : null, kind: input.kind, entityId: input.entityId, requestKey: input.requestKey, inputHash, payload: { message: input.message, ...(input.kind === "TEST_AGENT" ? { simulationStage: input.simulationStage ?? "REPLY" } : {}) }, status: aiConfiguration().configured ? "QUEUED" : "WAITING_CONFIGURATION" } }); await recordEvent(tx, { tenantId: actor.tenantId, actorUserId: commercialActorId(actor), action: "COMMERCIAL_AI_JOB_REQUESTED", entityType: "CommercialAIJob", entityId: item.id }); return { id: item.id, status: item.status };
  });
}
export { randomUUID };

