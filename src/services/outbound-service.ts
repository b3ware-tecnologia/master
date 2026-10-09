import { createHash, randomUUID } from "node:crypto";
import { Prisma, type OutboundDispatch } from "@prisma/client";
import { z } from "zod";
import { roleAccessScope, roleCapabilities } from "@/domain/access";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { OutboundDisabled, outboundEnabled, outboundRequestSchema } from "@/domain/outbound";
import { MessagingProviderUnavailable, type SendingMessagingProvider } from "@/domain/messaging-provider";
import { db } from "@/lib/db";
import { configuredEvolutionProvider } from "@/integrations/evolution-provider";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";
import { evaluateEligibility } from "@/services/messaging-governance";
import { lockMessagingTarget } from "@/services/messaging-locks";
import { recordEvent } from "@/services/events";
import { resolveMessagingConnection } from "@/services/messaging-connection-resolver";
import { assertAutomatedPlan } from "@/services/outreach-authority";
import { channelCadenceState } from "@/services/channel-cadence";

type Runtime = { enabled: () => boolean; configured: () => boolean; provider: () => SendingMessagingProvider };
const defaultRuntime: Runtime = { enabled: outboundEnabled, configured: () => Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY), provider: configuredEvolutionProvider };
function actorId(actor: CRMActor) { return "context" in actor ? actor.context.userId : actor.platformUserId; }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
const publicSelect = { id: true, planId: true, status: true, version: true, reasons: true, createdAt: true, startedAt: true, acceptedAt: true, providerMessageId: true, customer: { select: { fullName: true } } } satisfies Prisma.OutboundDispatchSelect;

async function snapshot(transaction: Prisma.TransactionClient, actor: CRMActor, planId: string, recipientIdentifierId?: string, runtime = defaultRuntime, excludeId?: string, connectionId?: string) {
  await authorizeCRMActor(transaction, actor, "messaging.send");
  const plan = await transaction.relationshipPlan.findFirst({ where: { id: planId, tenantId: actor.tenantId }, include: { customer: { include: { identifiers: true } } } });
  if (!plan) throw new NotFoundError();
  await assertAutomatedPlan(transaction, plan.id);
  const [policy, preference, connection, accepted, pending] = await Promise.all([
    transaction.messagingPolicy.findUnique({ where: { tenantId: actor.tenantId } }),
    transaction.communicationPreference.findUnique({ where: { tenantId_customerId_channel: { tenantId: actor.tenantId, customerId: plan.customerId, channel: "WHATSAPP" } } }),
    resolveMessagingConnection(transaction, actor.tenantId, connectionId),
    transaction.outboundDispatch.findFirst({ where: { tenantId: actor.tenantId, customerId: plan.customerId, status: "ACCEPTED" }, orderBy: [{ acceptedAt: "desc" }, { id: "desc" }], select: { id: true, acceptedAt: true } }),
    transaction.outboundDispatch.findFirst({ where: { tenantId: actor.tenantId, customerId: plan.customerId, status: { in: ["SENDING", "UNCERTAIN"] }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } }),
  ]);
  const recipients = plan.customer.identifiers.filter((identifier) => identifier.type === "PHONE" && ["IMPORTED", "CONFIRMED"].includes(identifier.verification) && /^[1-9]\d{9,14}$/.test(identifier.normalizedValue));
  const recipient = recipientIdentifierId ? recipients.find((item) => item.id === recipientIdentifierId) : recipients.length === 1 ? recipients[0] : undefined;
  const contactAt = plan.customer.lastOutboundAt && (!accepted?.acceptedAt || plan.customer.lastOutboundAt > accepted.acceptedAt) ? plan.customer.lastOutboundAt : accepted?.acceptedAt ?? null;
  const result = evaluateEligibility({ now: new Date(), status: plan.status, approvedAt: plan.approvedAt, scheduledAt: plan.scheduledAt, channel: plan.channel, customerActive: plan.customer.status === "ACTIVE", recipientAvailable: Boolean(recipient), consent: preference?.consent, lastOutboundAt: contactAt, policy });
  const reasons = [...result.reasons];
  if (plan.channel !== "WHATSAPP") reasons.push("UNSUPPORTED_CHANNEL");
  if (!recipient && recipients.length > 1) reasons.push("SELECT_RECIPIENT");
  if (!connection?.enabled) reasons.push("CONNECTION_REQUIRED");
  if (connection?.pausedUntil && connection.pausedUntil > new Date()) reasons.push("CONNECTION_PAUSED");
  if (!runtime.enabled()) reasons.push("OUTBOUND_DISABLED");
  if (!runtime.configured()) reasons.push("PROVIDER_REQUIRED");
  if (pending) reasons.push("OTHER_ATTEMPT_UNCONFIRMED");
  if (recipient && await transaction.doNotContact.findUnique({ where: { tenantId_phone: { tenantId: actor.tenantId, phone: recipient.normalizedValue } } })) reasons.push("DO_NOT_CONTACT");
  const cadence = connection ? await channelCadenceState(transaction, actor.tenantId, connection.id, excludeId) : null;
  if (cadence) { reasons.push(...cadence.reasons); const turn = await transaction.outreachTurn.findUnique({ where: { planId: plan.id } }); if (turn?.kind === "INITIAL" && cadence.policy && cadence.dailyNewContacts >= cadence.policy.newContactsLimit) reasons.push("CHANNEL_NEW_CONTACT_LIMIT"); if (turn?.kind === "FOLLOWUP" && cadence.policy && cadence.dailyFollowUps >= cadence.policy.followUpLimit) reasons.push("CHANNEL_FOLLOWUP_LIMIT"); }
  const snapshotHash = hash({ plan: { id: plan.id, tenantId: plan.tenantId, customerId: plan.customerId, status: plan.status, approvedAt: plan.approvedAt, updatedAt: plan.updatedAt, message: plan.message, channel: plan.channel, scheduledAt: plan.scheduledAt }, customerStatus: plan.customer.status, lastOutboundAt: plan.customer.lastOutboundAt, recipient: recipient ? { id: recipient.id, value: recipient.normalizedValue, verification: recipient.verification, updatedAt: recipient.updatedAt } : null, policy, cadence: cadence?.policy ?? null, preference: preference ? { consent: preference.consent, updatedAt: preference.updatedAt } : null, connection: connection ? { id: connection.id, instanceName: connection.instanceName, enabled: connection.enabled } : null, accepted });
  return { plan, recipient, recipients, connection, snapshotHash, eligible: reasons.length === 0, reasons };
}
export async function outboundPreview(actor: CRMActor, planId: string, recipientIdentifierId?: string, runtime = defaultRuntime, connectionId?: string) {
  return db.$transaction(async (transaction) => {
    const state = await snapshot(transaction, actor, planId, recipientIdentifierId, runtime, undefined, connectionId);
    const existing = await transaction.outboundDispatch.findUnique({ where: { planId }, select: publicSelect });
    const connections = await transaction.messagingConnection.findMany({ where: { tenantId: actor.tenantId }, select: { id: true, instanceName: true, enabled: true, isDefault: true } });
    return { configured: runtime.enabled(), connectionId: state.connection?.id ?? null, connections, plan: { id: state.plan.id, purpose: state.plan.purpose, message: state.plan.message, status: state.plan.status, scheduledAt: state.plan.scheduledAt, customer: { fullName: state.plan.customer.fullName } }, recipients: state.recipients.map((item) => ({ id: item.id, number: item.normalizedValue })), selectedRecipientId: state.recipient?.id ?? null, snapshotHash: state.snapshotHash, eligible: state.eligible, reasons: state.reasons, existing };
  });
}
export async function requestOutbound(actor: CRMActor, input: z.infer<typeof outboundRequestSchema>, runtime = defaultRuntime) {
  const data = outboundRequestSchema.parse(input); const inputHash = hash({ actor: actorId(actor), ...data });
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "messaging.send");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outbound-request:${actor.tenantId}:${data.requestKey}`}, 0))`;
    const existing = await transaction.outboundDispatch.findUnique({ where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: data.requestKey } }, select: { ...publicSelect, inputHash: true } });
    if (existing) { if (existing.inputHash !== inputHash) throw new ConflictError("Esta solicitação já foi usada com outros dados."); const { inputHash: _hash, ...safe } = existing; void _hash; return safe; }
    if (!runtime.enabled()) throw new OutboundDisabled();
    const plan = await transaction.relationshipPlan.findFirst({ where: { id: data.planId, tenantId: actor.tenantId } }); if (!plan) throw new NotFoundError();
    await lockMessagingTarget(transaction, actor.tenantId, plan.customerId);
    if (await transaction.outboundDispatch.findUnique({ where: { planId: data.planId } })) throw new ConflictError("Este plano já possui uma solicitação de envio. Consulte seu resultado antes de continuar.");
    const state = await snapshot(transaction, actor, data.planId, data.recipientIdentifierId, runtime, undefined, data.connectionId);
    if (state.snapshotHash !== data.snapshotHash) throw new ConflictError("Os dados mudaram. Revise novamente o destinatário e o texto.");
    if (!state.eligible || !state.connection || !state.recipient) throw new ConflictError(`Envio bloqueado: ${state.reasons.join(", ")}`);
    if (await transaction.outboundDispatch.count({ where: { tenantId: actor.tenantId, createdAt: { gt: new Date(Date.now() - 3600_000) } } }) >= 20) throw new ConflictError("O limite de vinte solicitações por hora foi atingido.");
    const item = await transaction.outboundDispatch.create({ data: { tenantId: actor.tenantId, planId: data.planId, customerId: state.plan.customerId, connectionId: state.connection.id, recipientIdentifierId: state.recipient.id, requestedById: actorId(actor), requestedMembershipId: "context" in actor ? actor.context.membershipId : null, requestKey: data.requestKey, inputHash, snapshotHash: state.snapshotHash, recipient: state.recipient.normalizedValue, message: state.plan.message, reasons: [] }, select: publicSelect });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "WHATSAPP_SEND_REQUESTED", entityType: "OutboundDispatch", entityId: item.id, metadata: { planId: data.planId, customerId: state.plan.customerId }, idempotencyKey: `outbound-requested:${item.id}` });
    return item;
  });
}
export async function listOutbound(actor: CRMActor) {
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "messaging.send");
    const [plans, dispatches] = await Promise.all([
      transaction.relationshipPlan.findMany({ where: { tenantId: actor.tenantId, channel: "WHATSAPP" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, purpose: true, status: true, scheduledAt: true, customer: { select: { fullName: true } } } }),
      transaction.outboundDispatch.findMany({ where: { tenantId: actor.tenantId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: publicSelect }),
    ]);
    return { enabled: defaultRuntime.enabled(), plans, dispatches };
  });
}
export async function cancelOutbound(actor: CRMActor, id: string, expectedVersion: number) {
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "messaging.send");
    const item = await transaction.outboundDispatch.findFirst({ where: { id, tenantId: actor.tenantId } }); if (!item) throw new NotFoundError();
    await lockMessagingTarget(transaction, actor.tenantId, item.customerId);
    const changed = await transaction.outboundDispatch.updateMany({ where: { id, tenantId: actor.tenantId, status: "QUEUED", version: expectedVersion }, data: { status: "CANCELLED", version: { increment: 1 }, reasons: [] } });
    if (!changed.count) throw new ConflictError("O envio já começou ou mudou. Atualize a página.");
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "WHATSAPP_SEND_CANCELLED", entityType: "OutboundDispatch", entityId: id, idempotencyKey: `outbound-cancelled:${id}` });
    return transaction.outboundDispatch.findUniqueOrThrow({ where: { id }, select: publicSelect });
  });
}
export async function retryOutbound(actor: CRMActor, id: string, input: { expectedVersion: number; confirmed: true }, runtime = defaultRuntime) {
  const data = z.strictObject({ expectedVersion: z.number().int().min(0), confirmed: z.literal(true) }).parse(input);
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "messaging.send");
    const item = await transaction.outboundDispatch.findFirst({ where: { id, tenantId: actor.tenantId } }); if (!item) throw new NotFoundError();
    await lockMessagingTarget(transaction, actor.tenantId, item.customerId);
    if (item.status !== "DEAD_LETTER" || item.version !== data.expectedVersion || item.providerMessageId) throw new ConflictError("Somente uma falha confirmada antes do envio pode ser retomada.");
    const state = await snapshot(transaction, actor, item.planId, item.recipientIdentifierId, runtime, item.id, item.connectionId);
    if (!state.eligible || state.plan.message !== item.message || state.recipient?.normalizedValue !== item.recipient) throw new ConflictError("O texto, destinatário ou as condições de envio mudaram. Confira o plano.");
    const changed = await transaction.outboundDispatch.updateMany({ where: { id, status: "DEAD_LETTER", version: data.expectedVersion }, data: { status: "QUEUED", snapshotHash: state.snapshotHash, requestedById: actorId(actor), requestedMembershipId: "context" in actor ? actor.context.membershipId : null, reasons: [], attempts: 0, nextAttemptAt: new Date(), startedAt: null, claimToken: null, version: { increment: 1 } } });
    if (!changed.count) throw new ConflictError("A tentativa mudou.");
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "WHATSAPP_SEND_RETRY_AUTHORIZED", entityType: "OutboundDispatch", entityId: id, metadata: { previousVersion: data.expectedVersion } });
    return transaction.outboundDispatch.findUniqueOrThrow({ where: { id }, select: publicSelect });
  });
}
async function observedCandidates(transaction: Prisma.TransactionClient, item: OutboundDispatch) {
  if (!item.startedAt) return [];
  return transaction.conversationMessage.findMany({ where: { tenantId: item.tenantId, connectionId: item.connectionId, direction: "OUTBOUND", kind: "TEXT", text: item.message, conversation: { remoteJid: `${item.recipient}@s.whatsapp.net` }, occurredAt: { gte: new Date(item.startedAt.valueOf() - 30_000), lte: new Date(item.startedAt.valueOf() + 120_000) } }, take: 20, orderBy: { occurredAt: "asc" }, select: { id: true, providerMessageId: true, occurredAt: true } });
}
export async function outboundDetail(actor: CRMActor, id: string) {
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "messaging.send");
    const item = await transaction.outboundDispatch.findFirst({ where: { id, tenantId: actor.tenantId } }); if (!item) throw new NotFoundError();
    const candidates = item.status === "UNCERTAIN" ? await observedCandidates(transaction, item) : [];
    return { id: item.id, status: item.status, version: item.version, recipient: item.recipient, message: item.message, reasons: item.reasons, candidates: candidates.map(({ providerMessageId: _id, ...safe }) => { void _id; return safe; }) };
  });
}
export async function reconcileOutbound(actor: CRMActor, id: string, expectedVersion: number, messageId: string) {
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "messaging.send");
    const item = await transaction.outboundDispatch.findFirst({ where: { id, tenantId: actor.tenantId } }); if (!item) throw new NotFoundError();
    await lockMessagingTarget(transaction, actor.tenantId, item.customerId);
    const observed = (await observedCandidates(transaction, item)).find((message) => message.id === messageId);
    if (!observed) throw new ConflictError("Não há uma mensagem observada correspondente ao destinatário, texto e horário desta tentativa.");
    if (await transaction.outboundDispatch.findFirst({ where: { connectionId: item.connectionId, providerMessageId: observed.providerMessageId, id: { not: id } } })) throw new ConflictError("A mensagem já foi associada a outra solicitação.");
    const changed = await transaction.outboundDispatch.updateMany({ where: { id, tenantId: actor.tenantId, status: "UNCERTAIN", version: expectedVersion }, data: { status: "ACCEPTED", acceptedAt: observed.occurredAt, providerMessageId: observed.providerMessageId, reconciledMessageId: observed.id, version: { increment: 1 }, reasons: [] } });
    if (!changed.count) throw new ConflictError("A tentativa mudou. Atualize a página.");
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "WHATSAPP_SEND_RECONCILED", entityType: "OutboundDispatch", entityId: id, metadata: { observedMessageId: observed.id }, idempotencyKey: `outbound-reconciled:${id}` });
    return transaction.outboundDispatch.findUniqueOrThrow({ where: { id }, select: publicSelect });
  });
}
async function requester(transaction: Prisma.TransactionClient, item: OutboundDispatch): Promise<CRMActor> {
  if (!item.requestedMembershipId) return { tenantId: item.tenantId, platformUserId: item.requestedById };
  const membership = await transaction.membership.findUniqueOrThrow({ where: { id: item.requestedMembershipId } });
  return { tenantId: item.tenantId, context: { tenantId: item.tenantId, userId: item.requestedById, membershipId: membership.id, role: membership.role, accessScope: roleAccessScope[membership.role], capabilities: roleCapabilities[membership.role] } };
}
async function finish(transaction: Prisma.TransactionClient, item: OutboundDispatch, claimToken: string, status: "BLOCKED" | "UNCERTAIN" | "ACCEPTED" | "DEAD_LETTER" | "QUEUED", reasons: string[], providerMessageId?: string) {
  const changed = await transaction.outboundDispatch.updateMany({ where: { id: item.id, status: "SENDING", claimToken }, data: { status, reasons, version: { increment: 1 }, ...(status === "QUEUED" ? { claimToken: null, startedAt: null, nextAttemptAt: new Date(Date.now() + 1000 * 2 ** Math.min(item.attempts, 8)) } : {}), ...(providerMessageId ? { providerMessageId } : {}), ...(status === "ACCEPTED" ? { acceptedAt: new Date() } : {}) } });
  if (!changed.count) throw new ConflictError("Dispatch claim is no longer current");
  if (status === "ACCEPTED") {
    const turn = await transaction.outreachTurn.findUnique({ where: { planId: item.planId } });
    if (turn) {
      await transaction.outreachTurn.updateMany({ where: { id: turn.id, status: "READY" }, data: { status: "SENT" } });
      await transaction.outreachSession.update({ where: { id: turn.sessionId }, data: { lastSentAt: new Date() } });
      if (turn.sourceKey.startsWith("task:")) { const [, taskId, version] = turn.sourceKey.split(":"); await transaction.opportunityTask.updateMany({ where: { id: taskId, tenantId: turn.tenantId, status: "QUEUED", version: Number(version) }, data: { status: "COMPLETED", version: { increment: 1 } } }); }
    }
    await transaction.messagingConnection.update({ where: { id: item.connectionId }, data: { lastOutboundAt: new Date() } });
  }
  await recordEvent(transaction, { tenantId: item.tenantId, action: `WHATSAPP_SEND_${status}`, entityType: "OutboundDispatch", entityId: item.id, metadata: { reasons }, idempotencyKey: `outbound-${status.toLowerCase()}:${item.id}:${item.version}` });
}
export async function processOutboundBatch(runtime = defaultRuntime) {
  // Unknown outcomes are never automatically retried, including a crashed worker after the durable claim.
  const stale = await db.outboundDispatch.findMany({ where: { status: "SENDING", startedAt: { lt: new Date(Date.now() - 120_000) } }, take: 10 });
  for (const item of stale) await db.$transaction(async (transaction) => { await lockMessagingTarget(transaction, item.tenantId, item.customerId); const current = await transaction.outboundDispatch.findUniqueOrThrow({ where: { id: item.id } }); if (current.status === "SENDING" && current.claimToken) await finish(transaction, current, current.claimToken, "UNCERTAIN", ["WORKER_INTERRUPTED"]); });
  const queued = await db.outboundDispatch.findMany({ where: { status: "QUEUED", nextAttemptAt: { lte: new Date() }, connection: { OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }] } }, orderBy: { createdAt: "asc" }, take: 5 });
  let processed = 0;
  for (const candidate of queued) {
    const claimToken = randomUUID();
    const item = await db.$transaction(async (transaction) => {
      await lockMessagingTarget(transaction, candidate.tenantId, candidate.customerId);
      if (await transaction.outboundDispatch.findFirst({ where: { tenantId: candidate.tenantId, customerId: candidate.customerId, status: { in: ["SENDING", "UNCERTAIN"] }, id: { not: candidate.id } } })) return null;
      const changed = await transaction.outboundDispatch.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "SENDING", claimToken, startedAt: new Date(), attempts: { increment: 1 }, version: { increment: 1 } } });
      return changed.count ? transaction.outboundDispatch.findUniqueOrThrow({ where: { id: candidate.id } }) : null;
    });
    if (!item) continue;
    let sendStarted = false; let providerMessageId: string | undefined;
    try {
      if (!runtime.enabled()) { await db.$transaction((transaction) => finish(transaction, item, claimToken, "BLOCKED", ["OUTBOUND_DISABLED"])); continue; }
      const connection = await db.messagingConnection.findUniqueOrThrow({ where: { id: item.connectionId } });
      const provider = runtime.provider();
      if (await provider.getConnectionState(connection.instanceName) !== "OPEN") { await db.$transaction((transaction) => finish(transaction, item, claimToken, item.attempts >= 5 ? "DEAD_LETTER" : "QUEUED", ["CONNECTION_NOT_OPEN"])); continue; }
      await db.$transaction(async (transaction) => {
        await lockMessagingTarget(transaction, item.tenantId, item.customerId);
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-send:${item.connectionId}`}, 0))`;
        const automated = await transaction.outreachTurn.findUnique({ where: { planId: item.planId }, include: { session: true } });
        if (automated) await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outreach-campaign:${automated.session.campaignId}`}, 0))`;
        const current = await transaction.outboundDispatch.findUniqueOrThrow({ where: { id: item.id } });
        if (current.status !== "SENDING" || current.claimToken !== claimToken) throw new ConflictError("Dispatch claim lost");
        const actor = await requester(transaction, current);
        const state = await snapshot(transaction, actor, item.planId, item.recipientIdentifierId, runtime, item.id, item.connectionId);
        if (state.reasons.length && state.reasons.every((reason) => reason.startsWith("CHANNEL_"))) { await transaction.outboundDispatch.updateMany({ where: { id: item.id, status: "SENDING", claimToken }, data: { status: "QUEUED", attempts: { decrement: 1 }, reasons: state.reasons, nextAttemptAt: new Date(Date.now() + 300_000), startedAt: null, claimToken: null, version: { increment: 1 } } }); return; }
        if (state.reasons.length === 1 && state.reasons[0] === "CONNECTION_PAUSED") { await finish(transaction, item, claimToken, item.attempts >= 5 ? "DEAD_LETTER" : "QUEUED", state.reasons); return; }
        if (!state.eligible || state.snapshotHash !== item.snapshotHash || state.connection?.id !== item.connectionId || state.connection.instanceName !== connection.instanceName || state.recipient?.normalizedValue !== item.recipient || state.plan.message !== item.message) { await finish(transaction, item, claimToken, "BLOCKED", state.eligible ? ["SOURCE_CHANGED"] : state.reasons); return; }
        sendStarted = true;
        const result = await provider.sendText(connection.instanceName, item.recipient, item.message); providerMessageId = result.providerMessageId;
        await finish(transaction, item, claimToken, "ACCEPTED", [], providerMessageId);
      }, { timeout: 20_000, maxWait: 10_000 });
    } catch (error) {
      const reason = sendStarted ? "PROVIDER_OUTCOME_UNKNOWN" : error instanceof MessagingProviderUnavailable ? error.code : "ACCESS_OR_SOURCE_REVOKED";
      const status = sendStarted ? "UNCERTAIN" : error instanceof MessagingProviderUnavailable ? item.attempts >= 5 ? "DEAD_LETTER" : "QUEUED" : "BLOCKED";
      await db.$transaction((transaction) => finish(transaction, item, claimToken, status, [reason], providerMessageId)).catch(() => { /* Durable SENDING becomes UNCERTAIN on recovery; never resend. */ });
    }
    processed++;
  }
  return processed;
}


