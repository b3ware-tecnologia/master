import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { campaignSchema, campaignActionSchema, sessionControlSchema } from "@/domain/outreach";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { AIUnavailable } from "@/domain/conversation-ai";
import { db } from "@/lib/db";
import { aiConfiguration, configuredAIModel } from "@/integrations/ai-gateway";
import { generateOutreach, OutreachPrompt, validateOutreachResult } from "@/integrations/outreach-gateway";
import { authorizeCRMActor, createCRMCase, type CRMActor } from "@/services/crm-service";
import { customerScope } from "@/services/customer-scope";
import { recordEvent } from "@/services/events";
import { lockMessagingTarget } from "@/services/messaging-locks";
import { evaluateEligibility } from "@/services/messaging-governance";
import { campaignActor, outreachEnabled, outreachSource } from "@/services/outreach-authority";
import { outboundPreview, requestOutbound } from "@/services/outbound-service";
import { assertTestHooksAllowed } from "@/services/test-hooks";
import { registerDoNotContact } from "@/services/commercial-events";
import { applyCommercialDecision, processCommercialFollowUps } from "@/services/opportunity-actions";

const actorId = (actor: CRMActor) => "context" in actor ? actor.context.userId : actor.platformUserId;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function lockCampaign(transaction: Prisma.TransactionClient, id: string) { await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outreach-campaign:${id}`}, 0))`; }
export async function listOutreach(actor: CRMActor) {
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "plans.manage");
    const [campaigns, lists, connections, sessions] = await Promise.all([
      transaction.outreachCampaign.findMany({ where: { tenantId: actor.tenantId }, orderBy: { createdAt: "desc" }, take: 50, include: { playbook: { select: { id: true, name: true, status: true } }, list: { select: { name: true } }, connection: { select: { instanceName: true } }, _count: { select: { sessions: true } } } }),
      transaction.customerList.findMany({ where: { tenantId: actor.tenantId, status: { not: "ARCHIVED" } }, select: { id: true, name: true, _count: { select: { members: true } } }, orderBy: { name: "asc" }, take: 200 }),
      transaction.messagingConnection.findMany({ where: { tenantId: actor.tenantId, enabled: true }, select: { id: true, instanceName: true, lastState: true, isDefault: true }, orderBy: { createdAt: "asc" } }),
      transaction.outreachSession.findMany({ where: { tenantId: actor.tenantId }, orderBy: { updatedAt: "desc" }, take: 50, include: { customer: { select: { fullName: true } }, campaign: { select: { name: true } }, turns: { take: 12, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, status: true, message: true, errorCode: true, createdAt: true, inputTokens: true, outputTokens: true } } } }),
    ]);
    const playbooks = await transaction.campaignPlaybook.findMany({ where: { tenantId: actor.tenantId, status: "APPROVED" }, select: { id: true, name: true }, take: 100 });
    return { playbooks, configuration: { ...aiConfiguration(), enabled: outreachEnabled(), outboundEnabled: process.env.WHATSAPP_OUTBOUND_ENABLED === "true" }, campaigns, lists, connections, sessions };
  });
}
export async function createOutreachCampaign(actor: CRMActor, input: z.infer<typeof campaignSchema>) {
  const data = campaignSchema.parse(input); const inputHash = hash({ actor: actorId(actor), data });
  if (new Date(data.endsAt) <= new Date()) throw new ConflictError("Defina uma validade futura.");
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "plans.manage");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outreach-create:${actor.tenantId}:${data.requestKey}`}, 0))`;
    const existing = await transaction.outreachCampaign.findUnique({ where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: data.requestKey } } });
    if (existing) { if (existing.inputHash !== inputHash) throw new ConflictError("Solicitação já usada com outros dados."); return existing; }
    if (!await transaction.customerList.findFirst({ where: { id: data.listId, tenantId: actor.tenantId, status: { not: "ARCHIVED" } } }) || !await transaction.messagingConnection.findFirst({ where: { id: data.connectionId, tenantId: actor.tenantId, enabled: true } })) throw new NotFoundError();
    if (data.playbookId && !await transaction.campaignPlaybook.findFirst({ where: { id: data.playbookId, tenantId: actor.tenantId, status: "APPROVED" } })) throw new NotFoundError();
    const item = await transaction.outreachCampaign.create({ data: { ...data, playbookRequired: true, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), tenantId: actor.tenantId, createdById: actorId(actor), inputHash } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "AI_CAMPAIGN_CREATED", entityType: "OutreachCampaign", entityId: item.id, idempotencyKey: `outreach-created:${item.id}` });
    return item;
  });
}
export async function changeOutreachCampaign(actor: CRMActor, id: string, input: z.infer<typeof campaignActionSchema>) {
  const data = campaignActionSchema.parse(input);
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, data.action === "authorize" ? "plans.approve" : "plans.manage");
    await authorizeCRMActor(transaction, actor, "messaging.send");
    await lockCampaign(transaction, id);
    const item = await transaction.outreachCampaign.findFirst({ where: { id, tenantId: actor.tenantId } }); if (!item) throw new NotFoundError();
    if (item.version !== data.expectedVersion || item.status === "ENDED") throw new ConflictError("A campanha mudou ou foi encerrada.");
    if (data.action === "authorize" && (data.confirmed !== true || item.endsAt <= new Date())) throw new ConflictError("Confira e autorize a lista, o objetivo, a conexão e os limites.");
    if (data.action === "authorize" && item.playbookRequired && (!item.playbookId || !await transaction.campaignPlaybook.findFirst({ where: { id: item.playbookId, tenantId: actor.tenantId, status: "APPROVED" } }))) throw new ConflictError("Aprovação da estratégia de abordagem é obrigatória para esta campanha.");
    const result = await transaction.outreachCampaign.update({ where: { id }, data: { status: data.action === "authorize" ? "ACTIVE" : data.action === "pause" ? "PAUSED" : "ENDED", version: { increment: 1 }, ...(data.action === "authorize" ? { authorizedById: actorId(actor), authorizedMemberId: "context" in actor ? actor.context.membershipId : null, authorizedAt: new Date() } : {}) } });
    // Any old generated text requires a fresh context after pausing or reauthorizing.
    await transaction.outreachTurn.updateMany({ where: { session: { campaignId: id }, status: { in: ["QUEUED", "RUNNING", "READY"] } }, data: { status: "CANCELLED", errorCode: "CAMPAIGN_CHANGED", lockToken: null } });
    if (data.action === "authorize") {
      const sessions = await transaction.outreachSession.findMany({ where: { campaignId: id, control: "AI" }, take: 200 });
      for (const session of sessions) {
        const latest = session.conversationId ? await transaction.conversationMessage.findFirst({ where: { conversationId: session.conversationId, tenantId: actor.tenantId, direction: "INBOUND" }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }) : null;
        if (!session.lastSentAt || (latest && latest.occurredAt > session.lastSentAt)) await transaction.outreachTurn.create({ data: { tenantId: actor.tenantId, sessionId: session.id, sourceKey: `reauthorize:${result.version}`, kind: session.lastSentAt ? "REPLY" : "INITIAL" } });
      }
    }
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: `AI_CAMPAIGN_${result.status}`, entityType: "OutreachCampaign", entityId: id, metadata: { version: result.version }, idempotencyKey: `outreach-state:${id}:${result.version}` });
    return result;
  });
}
export async function controlOutreachSession(actor: CRMActor, id: string, input: z.infer<typeof sessionControlSchema>) {
  const data = sessionControlSchema.parse(input);
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, data.control === "AI" ? "plans.manage" : "crm.update");
    const scoped = "context" in actor ? customerScope(actor.context) : { tenantId: actor.tenantId };
    const session = await transaction.outreachSession.findFirst({ where: { id, tenantId: actor.tenantId, customer: scoped } }); if (!session) throw new NotFoundError();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-customer:${actor.tenantId}:${session.customerId}`}, 0))`;
    await lockMessagingTarget(transaction, actor.tenantId, session.customerId); await lockCampaign(transaction, session.campaignId);
    if (!await transaction.customer.findFirst({ where: { ...scoped, id: session.customerId } })) throw new NotFoundError();
    if (session.control === "STOPPED") throw new ConflictError("O cliente encerrou o contato. Registre um novo consentimento antes de criar outro relacionamento.");
    if (!(await transaction.outreachSession.updateMany({ where: { id, version: data.expectedVersion }, data: { control: data.control, version: { increment: 1 }, handoffReason: data.control === "HUMAN" ? "ASSUMED_BY_TEAM" : null } })).count) throw new ConflictError("O atendimento mudou.");
    await transaction.outreachTurn.updateMany({ where: { sessionId: id, status: { in: ["QUEUED", "RUNNING", "READY"] } }, data: { status: "CANCELLED", lockToken: null, errorCode: "CONTROL_CHANGED" } });
    await transaction.opportunity.updateMany({ where: { sessionId: id, tenantId: actor.tenantId, stage: { notIn: ["WON", "LOST", "DO_NOT_CONTACT"] } }, data: { stage: data.control === "HUMAN" ? "HUMAN_HANDOFF" : "AI_CONVERSATION", ...(data.control === "HUMAN" ? { humanAssignedAt: new Date() } : {}), version: { increment: 1 } } });
    if (data.control === "AI" && session.conversationId) {
      const latest = await transaction.conversationMessage.findFirst({ where: { conversationId: session.conversationId, direction: "INBOUND", tenantId: actor.tenantId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
      if (latest && (!session.lastSentAt || latest.occurredAt > session.lastSentAt)) await transaction.outreachTurn.create({ data: { tenantId: actor.tenantId, sessionId: id, sourceKey: `resume:${session.version + 1}:${latest.id}`, kind: "REPLY" } });
    }
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: `AI_SESSION_${data.control}`, entityType: "OutreachSession", entityId: id, metadata: { version: session.version + 1 } });
    return { id, control: data.control, version: session.version + 1 };
  });
}
async function eligibleCustomer(transaction: Prisma.TransactionClient, tenantId: string, customerId: string) {
  const customer = await transaction.customer.findFirst({ where: { id: customerId, tenantId }, include: { identifiers: true } }); if (!customer) return false;
  const [policy, preference, pending] = await Promise.all([transaction.messagingPolicy.findUnique({ where: { tenantId } }), transaction.communicationPreference.findUnique({ where: { tenantId_customerId_channel: { tenantId, customerId, channel: "WHATSAPP" } } }), transaction.outboundDispatch.findFirst({ where: { tenantId, customerId, status: { in: ["QUEUED", "SENDING", "UNCERTAIN"] } } })]);
  const phones = customer.identifiers.filter((item) => item.type === "PHONE" && ["IMPORTED", "CONFIRMED"].includes(item.verification) && /^[1-9]\d{9,14}$/.test(item.normalizedValue));
  if (await transaction.doNotContact.findFirst({ where: { tenantId, phone: { in: phones.map((v) => v.normalizedValue) } } })) return false;
  return !pending && evaluateEligibility({ now: new Date(), status: "APPROVED", approvedAt: new Date(), scheduledAt: new Date(), channel: "WHATSAPP", customerActive: customer.status === "ACTIVE", recipientAvailable: phones.length === 1, consent: preference?.consent, lastOutboundAt: customer.lastOutboundAt, policy }).eligible;
}
async function scheduleInitialContacts() {
  const campaigns = await db.outreachCampaign.findMany({ where: { status: "ACTIVE", startsAt: { lte: new Date() }, endsAt: { gt: new Date() }, connection: { enabled: true, lastState: "OPEN", OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }] } }, take: 20, orderBy: { createdAt: "asc" } });
  for (const candidate of campaigns) await db.$transaction(async (transaction) => {
    await lockMessagingTarget(transaction, candidate.tenantId); await lockCampaign(transaction, candidate.id);
    const campaign = await transaction.outreachCampaign.findUniqueOrThrow({ where: { id: candidate.id } });
    if (campaign.status !== "ACTIVE" || campaign.endsAt <= new Date() || !campaign.authorizedAt) return;
    await campaignActor(transaction, campaign);
    const policy = await transaction.messagingPolicy.findUnique({ where: { tenantId: campaign.tenantId } }); if (!policy) return;
    const localDate = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: policy.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
    const today = localDate(new Date()); const recent = await transaction.outreachSession.findMany({ where: { campaignId: campaign.id, createdAt: { gt: new Date(Date.now() - 27 * 3600_000) } }, select: { createdAt: true } });
    const remaining = campaign.maxContactsPerDay - recent.filter((item) => localDate(item.createdAt) === today).length; if (remaining <= 0) return;
    const members = await transaction.customerListMember.findMany({ where: { tenantId: campaign.tenantId, listId: campaign.listId, createdAt: { lte: campaign.authorizedAt }, customer: { status: "ACTIVE", outreachSessions: { none: { OR: [{ campaignId: campaign.id }, { control: { in: ["AI", "HUMAN", "STOPPED"] }, campaign: { status: { in: ["ACTIVE", "PAUSED"] } } }] } } } }, orderBy: { id: "asc" }, take: 100 });
    let added = 0;
    for (const member of members) {
      if (added >= Math.min(remaining, 5)) break;
      if (!await eligibleCustomer(transaction, campaign.tenantId, member.customerId)) continue;
      const phone = (await transaction.customerIdentifier.findMany({ where: { tenantId: campaign.tenantId, customerId: member.customerId, type: "PHONE", verification: { in: ["IMPORTED", "CONFIRMED"] } } })).find((item) => /^[1-9]\d{9,14}$/.test(item.normalizedValue))!;
      const conversation = await transaction.conversation.findUnique({ where: { connectionId_remoteJid: { connectionId: campaign.connectionId, remoteJid: `${phone.normalizedValue}@s.whatsapp.net` } } });
      const session = await transaction.outreachSession.create({ data: { tenantId: campaign.tenantId, customerId: member.customerId, campaignId: campaign.id, conversationId: conversation?.id ?? null } });
      await transaction.outreachTurn.create({ data: { tenantId: campaign.tenantId, sessionId: session.id, sourceKey: "initial", kind: "INITIAL" } }); added++;
    }
  }).catch(() => { /* A revoked campaign is ineligible, and cannot stop processing other companies. */ });
}
async function scheduleFollowUps() {
  const sessions = await db.outreachSession.findMany({ where: { control: "AI", followUpQueued: false, lastSentAt: { not: null }, campaign: { status: "ACTIVE", followUpHours: { not: null }, endsAt: { gt: new Date() } } }, take: 50, orderBy: { lastSentAt: "asc" }, include: { campaign: true } });
  for (const session of sessions) {
    if (Date.now() - session.lastSentAt!.valueOf() < session.campaign.followUpHours! * 3600_000) continue;
    await db.$transaction(async (transaction) => {
      await lockMessagingTarget(transaction, session.tenantId, session.customerId); await lockCampaign(transaction, session.campaignId);
      if (await transaction.outreachTurn.findFirst({ where: { sessionId: session.id, kind: "REPLY" } }) || !await eligibleCustomer(transaction, session.tenantId, session.customerId)) return;
      if (!(await transaction.outreachSession.updateMany({ where: { id: session.id, control: "AI", followUpQueued: false }, data: { followUpQueued: true } })).count) return;
      await transaction.outreachTurn.create({ data: { tenantId: session.tenantId, sessionId: session.id, kind: "FOLLOWUP", sourceKey: "followup-1" } });
    });
  }
}
export async function processOutreachBatch(generator?: typeof generateOutreach) {
  assertTestHooksAllowed(!!generator);
  await processOutreachHandoffs();
  if (!outreachEnabled() || !aiConfiguration().configured || process.env.WHATSAPP_OUTBOUND_ENABLED !== "true") return 0;
  await db.outreachTurn.updateMany({ where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 120_000) } }, data: { status: "FAILED", errorCode: "WORKER_INTERRUPTED", lockToken: null } });
  await scheduleInitialContacts(); await scheduleFollowUps(); await processCommercialFollowUps();
  // A READY turn committed before a worker crash is queued idempotently without another model call.
  const ready = await db.outreachTurn.findMany({ where: { status: "READY", planId: { not: null }, plan: { outboundDispatch: null } }, take: 5 });
  for (const item of ready) await queueReadyTurn(item.id).catch(() => {});
  const jobs = await db.outreachTurn.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: 5 }); let processed = 0;
  for (const job of jobs) {
    const token = randomUUID();
    try {
      const source = await db.$transaction(async (transaction) => {
        const session = await transaction.outreachSession.findUniqueOrThrow({ where: { id: job.sessionId } });
        await lockMessagingTarget(transaction, job.tenantId, session.customerId); await lockCampaign(transaction, session.campaignId);
        const current = await outreachSource(transaction, job.sessionId, job.tenantId, job.kind);
        if (!await eligibleCustomer(transaction, job.tenantId, session.customerId)) return null;
        if (await transaction.outreachTurn.count({ where: { tenantId: job.tenantId, startedAt: { gt: new Date(Date.now() - 3600_000) } } }) >= 20) return null;
        if (await transaction.outreachTurn.count({ where: { sessionId: job.sessionId, status: { in: ["RUNNING", "READY", "SENT"] }, id: { not: job.id } } }) >= current.campaign.maxTurns) throw new ConflictError("TURN_LIMIT");
        if (!(await transaction.outreachTurn.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "RUNNING", lockToken: token, startedAt: new Date(), fingerprint: current.fingerprint, model: configuredAIModel(), promptVersion: OutreachPrompt.version } })).count) return null;
        return current;
      });
      if (!source) continue;
      const output = await (generator ?? generateOutreach)(source.input);
      let handoff = false;
      await db.$transaction(async (transaction) => {
        await lockMessagingTarget(transaction, job.tenantId, source.session.customerId); await lockCampaign(transaction, source.campaign.id);
        const current = await outreachSource(transaction, job.sessionId, job.tenantId, job.kind);
        const owned = await transaction.outreachTurn.findFirst({ where: { id: job.id, status: "RUNNING", lockToken: token } });
        if (!owned) return;
        if (current.fingerprint !== source.fingerprint || !await eligibleCustomer(transaction, job.tenantId, source.session.customerId)) throw new ConflictError("CONTEXT_CHANGED");
        const result = validateOutreachResult(output.result, source.input);
        if (result.commercialDecision) await applyCommercialDecision(transaction, current, job.id, result.commercialDecision);
        const stop = result.nextStep === "STOP" || result.intent === "OPT_OUT";
        handoff = result.nextStep === "HANDOFF" || result.intent === "HUMAN_REQUEST";
        if (stop || handoff) {
          await transaction.outreachSession.update({ where: { id: job.sessionId }, data: { control: stop ? "STOPPED" : "HUMAN", version: { increment: 1 }, handoffReason: stop ? result.intent === "OPT_OUT" ? "CUSTOMER_OPTED_OUT" : "NOT_INTERESTED" : "AI_HANDOFF" } });
          if (stop && result.intent === "OPT_OUT") { const phones = await transaction.customerIdentifier.findMany({ where: { tenantId: job.tenantId, customerId: source.session.customerId, type: "PHONE" } }); for (const phone of phones) await registerDoNotContact(transaction, job.tenantId, phone.normalizedValue, "Pedido de exclusão identificado na conversa.", "AI_DECISION", job.id); }
          await transaction.outreachTurn.update({ where: { id: job.id }, data: { status: stop ? "STOPPED" : "HANDOFF", result: result, inputTokens: output.inputTokens, outputTokens: output.outputTokens, completedAt: new Date(), lockToken: null } });
        } else {
          const plan = await transaction.relationshipPlan.create({ data: { tenantId: job.tenantId, customerId: source.session.customerId, createdById: source.campaign.authorizedById!, approvedById: source.campaign.authorizedById!, requestKey: randomUUID(), purpose: `IA: ${source.campaign.name}`.slice(0, 200), message: result.message, channel: "WHATSAPP", scheduledAt: new Date(), status: "APPROVED", approvedAt: source.campaign.authorizedAt } });
          const generatedContext = await outreachSource(transaction, job.sessionId, job.tenantId, job.kind);
          await transaction.outreachTurn.update({ where: { id: job.id }, data: { status: "READY", fingerprint: generatedContext.fingerprint, message: result.message, result: result, planId: plan.id, inputTokens: output.inputTokens, outputTokens: output.outputTokens, completedAt: new Date(), lockToken: null } });
        }
        await recordEvent(transaction, { tenantId: job.tenantId, actorUserId: source.campaign.authorizedById!, action: "AI_OUTREACH_GENERATED", entityType: "OutreachTurn", entityId: job.id, metadata: { campaignId: source.campaign.id, nextStep: result.nextStep, promptVersion: OutreachPrompt.version }, idempotencyKey: `outreach-generated:${job.id}` });
      });
      if (handoff) await createCRMCase(source.actor, { requestKey: randomUUID(), customerId: source.session.customerId, conversationId: source.session.conversationId ?? undefined, title: "Atendimento solicitado pela assistente virtual", description: "Confira a conversa e assuma o atendimento. A assistente foi pausada para este cliente." }).catch(() => {});
      else await queueReadyTurn(job.id);
      processed++;
    } catch (error) {
      await db.outreachTurn.updateMany({ where: { id: job.id, OR: [{ status: "QUEUED" }, { status: "RUNNING", lockToken: token }] }, data: { status: "FAILED", errorCode: error instanceof AIUnavailable ? error.code : "ACCESS_OR_CONTEXT_CHANGED", lockToken: null, completedAt: new Date() } });
    }
  }
  return processed;
}
export async function processOutreachHandoffs() {
  const sessions = await db.outreachSession.findMany({ where: { control: "HUMAN", handoffReason: { in: ["HUMAN_REQUEST", "AI_HANDOFF"] }, customer: { crmCases: { none: { status: { in: ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] } } } } }, include: { campaign: true }, take: 20 });
  for (const session of sessions) {
    const key = hash(`handoff:${session.id}:${session.version}`);
    const requestKey = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
    try {
      const actor = await db.$transaction((transaction) => campaignActor(transaction, session.campaign));
      await createCRMCase(actor, { requestKey, customerId: session.customerId, conversationId: session.conversationId ?? undefined, title: "Cliente encaminhado pela assistente virtual", description: "Confira as mensagens e continue o atendimento. A assistente está pausada para este cliente." });
    } catch { /* A current authorized owner must exist before a CRM write. Retry uses the same persisted source key. */ }
  }
}
async function queueReadyTurn(id: string) {
  const turn = await db.outreachTurn.findFirst({ where: { id, status: "READY", planId: { not: null } }, include: { session: { include: { campaign: true } } } }); if (!turn) return;
  const actor = await db.$transaction((transaction) => campaignActor(transaction, turn.session.campaign));
  const preview = await outboundPreview(actor, turn.planId!, undefined, undefined, turn.session.campaign.connectionId);
  if (preview.existing || !preview.eligible || !preview.selectedRecipientId) return;
  // Stable request key survives retries after the queue write; each turn has exactly one plan/dispatch.
  const key = createHash("sha256").update(`outreach:${turn.id}`).digest("hex");
  const requestKey = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
  await requestOutbound(actor, { requestKey, planId: turn.planId!, connectionId: turn.session.campaign.connectionId, recipientIdentifierId: preview.selectedRecipientId, snapshotHash: preview.snapshotHash, confirmed: true });
}
