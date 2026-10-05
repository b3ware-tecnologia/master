import { createHash, randomUUID } from "node:crypto";
import { Prisma, type AIExecution } from "@prisma/client";
import { roleCapabilities } from "@/domain/access";
import { AIUnavailable, aiInputSchema, analysisSchema } from "@/domain/conversation-ai";
import { AuthorizationError, ConflictError, NotFoundError } from "@/domain/errors";
import { db } from "@/lib/db";
import { aiConfiguration, analyzeWithGateway, configuredAIModel, PromptRegistry } from "@/integrations/ai-gateway";
import { authorizeConversationActor, type ConversationActor } from "@/services/conversation-service";
import { recordEvent } from "@/services/events";
import { assertTestHooksAllowed } from "@/services/test-hooks";

function actorId(actor: ConversationActor) { return "context" in actor ? actor.context.userId : actor.platformUserId; }
async function source(transaction: Prisma.TransactionClient, tenantId: string, conversationId: string, lock = false) {
  const conversation = await transaction.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { id: true, customerId: true, connectionId: true } });
  if (!conversation) throw new NotFoundError();
  if (lock) await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-webhook:${conversation.connectionId}`}, 0))`;
  const current = await transaction.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId } });
  const messages = await transaction.conversationMessage.findMany({ where: { tenantId, conversationId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, direction: true, kind: true, text: true, occurredAt: true } });
  const total = await transaction.conversationMessage.count({ where: { tenantId, conversationId } });
  const fingerprint = createHash("sha256").update(JSON.stringify({ customerId: current.customerId, total, messages })).digest("hex");
  let remaining = 24_000; let truncated = total > messages.length;
  const bounded = messages.map((message) => {
    const text = message.text === null ? null : message.text.slice(0, Math.min(2000, remaining));
    if (text !== null) { remaining -= text.length; if (text.length < message.text!.length) truncated = true; }
    return { ...message, text, occurredAt: message.occurredAt.toISOString() };
  }).reverse();
  return { conversation: current, fingerprint, input: { messages: bounded, truncated } };
}
const publicSelect = { id: true, status: true, model: true, promptVersion: true, result: true, errorCode: true, createdAt: true, completedAt: true, decision: { select: { id: true, createdAt: true } }, usage: { select: { inputTokens: true, outputTokens: true } } } satisfies Prisma.AIExecutionSelect;
export async function getConversationAnalysis(actor: ConversationActor, conversationId: string) {
  return db.$transaction(async (transaction) => {
    await authorizeConversationActor(transaction, actor);
    const current = await source(transaction, actor.tenantId, conversationId);
    const latest = await transaction.aIExecution.findFirst({ where: { tenantId: actor.tenantId, conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { ...publicSelect, fingerprint: true } });
    const execution = latest ? { id: latest.id, status: latest.status, model: latest.model, promptVersion: latest.promptVersion, result: latest.result, errorCode: latest.errorCode, createdAt: latest.createdAt, completedAt: latest.completedAt, decision: latest.decision, usage: latest.usage } : null;
    return { ...aiConfiguration(), execution, stale: latest ? latest.fingerprint !== current.fingerprint : false, customerLinked: !!current.conversation.customerId };
  });
}
export async function requestConversationAnalysis(actor: ConversationActor, conversationId: string) {
  return db.$transaction(async (transaction) => {
    await authorizeConversationActor(transaction, actor);
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-request:${actor.tenantId}`}, 0))`;
    const current = await source(transaction, actor.tenantId, conversationId, true);
    if (!aiConfiguration().configured) throw new AIUnavailable("NOT_CONFIGURED");
    const model = configuredAIModel();
    if (!current.input.messages.some((message) => !!message.text?.trim())) throw new ConflictError("Esta conversa ainda não tem texto para análise.");
    const existing = await transaction.aIExecution.findFirst({ where: { tenantId: actor.tenantId, conversationId, fingerprint: current.fingerprint, promptVersion: PromptRegistry.version, model, status: { not: "FAILED" } }, orderBy: { createdAt: "desc" }, select: publicSelect });
    if (existing) return existing;
    if (await transaction.aIExecution.count({ where: { tenantId: actor.tenantId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } }) >= 10) throw new ConflictError("Limite de 10 análises por hora atingido para esta empresa.");
    const execution = await transaction.aIExecution.create({ data: { tenantId: actor.tenantId, conversationId, requestedById: actorId(actor), requesterRole: "context" in actor ? "TENANT_MASTER" : "PLATFORM_ADMIN", model, promptVersion: PromptRegistry.version, fingerprint: current.fingerprint, input: current.input }, select: publicSelect });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "AI_ANALYSIS_REQUESTED", entityType: "AIExecution", entityId: execution.id, metadata: { conversationId, model, promptVersion: PromptRegistry.version } });
    return execution;
  });
}
async function workerAuthorize(transaction: Prisma.TransactionClient, execution: AIExecution) {
  if (execution.requesterRole === "PLATFORM_ADMIN") return authorizeConversationActor(transaction, { tenantId: execution.tenantId, platformUserId: execution.requestedById });
  if (execution.requesterRole !== "TENANT_MASTER") throw new AuthorizationError();
  const membership = await transaction.membership.findFirst({ where: { userId: execution.requestedById, tenantId: execution.tenantId, role: "TENANT_MASTER", status: "ACTIVE" } });
  if (!membership) throw new AuthorizationError();
  await authorizeConversationActor(transaction, { tenantId: execution.tenantId, context: { tenantId: execution.tenantId, userId: execution.requestedById, membershipId: membership.id, role: "TENANT_MASTER", accessScope: "TENANT", capabilities: roleCapabilities.TENANT_MASTER } });
}
export async function processAIExecution(executionId: string, fetcher?: typeof fetch) {
  assertTestHooksAllowed(!!fetcher);
  const lockToken = randomUUID();
  const claim = await db.aIExecution.updateMany({ where: { id: executionId, status: "QUEUED" }, data: { status: "RUNNING", lockToken, startedAt: new Date() } });
  if (!claim.count) return false;
  try {
    const execution = await db.aIExecution.findUniqueOrThrow({ where: { id: executionId } });
    await db.$transaction((transaction) => workerAuthorize(transaction, execution));
    if (execution.promptVersion !== PromptRegistry.version) throw new AIUnavailable("PROMPT_VERSION_CHANGED");
    const analyzed = await analyzeWithGateway(aiInputSchema.parse(execution.input), execution.model, fetcher);
    await db.$transaction(async (transaction) => {
      await workerAuthorize(transaction, execution);
      const completed = await transaction.aIExecution.updateMany({ where: { id: executionId, status: "RUNNING", lockToken }, data: { status: "COMPLETED", result: analyzed.result, completedAt: new Date(), lockToken: null } });
      if (!completed.count) return;
      await transaction.aIUsage.create({ data: { tenantId: execution.tenantId, executionId, inputTokens: analyzed.inputTokens, outputTokens: analyzed.outputTokens } });
      await recordEvent(transaction, { tenantId: execution.tenantId, action: "AI_ANALYSIS_COMPLETED", entityType: "AIExecution", entityId: executionId, metadata: { conversationId: execution.conversationId, model: execution.model } });
    });
  } catch (error) {
    const code = error instanceof AIUnavailable ? error.code : error instanceof AuthorizationError || error instanceof NotFoundError ? "ACCESS_REVOKED" : "INTERNAL_ERROR";
    await db.aIExecution.updateMany({ where: { id: executionId, status: "RUNNING", lockToken }, data: { status: "FAILED", errorCode: code, completedAt: new Date(), lockToken: null } });
  }
  return true;
}
export async function processAIBatch() {
  // A lost lease can mean the provider charged the call. Do not retry automatically.
  await db.aIExecution.updateMany({ where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 120_000) } }, data: { status: "FAILED", errorCode: "EXECUTION_INTERRUPTED", completedAt: new Date(), lockToken: null } });
  const jobs = await db.aIExecution.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true } });
  for (const job of jobs) await processAIExecution(job.id);
}
export async function saveAnalysisToCRM(actor: ConversationActor, conversationId: string, executionId: string) {
  return db.$transaction(async (transaction) => {
    await authorizeConversationActor(transaction, actor);
    const current = await source(transaction, actor.tenantId, conversationId, true);
    const execution = await transaction.aIExecution.findFirst({ where: { id: executionId, tenantId: actor.tenantId, conversationId }, include: { decision: true } });
    if (!execution) throw new NotFoundError();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-decision:${executionId}`}, 0))`;
    const existing = await transaction.aIDecision.findUnique({ where: { executionId } });
    if (existing) return { decisionId: existing.id, alreadySaved: true };
    if (execution.status !== "COMPLETED") throw new ConflictError("A análise ainda não foi concluída.");
    if (execution.fingerprint !== current.fingerprint) throw new ConflictError("A conversa mudou. Gere uma nova análise antes de salvar.");
    const customerId = current.conversation.customerId;
    if (!customerId || !await transaction.customer.findFirst({ where: { id: customerId, tenantId: actor.tenantId, status: "ACTIVE" } })) throw new ConflictError("Vincule esta conversa a um cliente ativo antes de salvar no CRM.");
    const analysis = analysisSchema.parse(execution.result);
    const timeline = await transaction.customerTimeline.create({ data: { tenantId: actor.tenantId, customerId, actorId: actorId(actor), eventType: "AI_CONVERSATION_REVIEWED", summary: `Análise de IA revisada: ${analysis.summary}`, metadata: { executionId, conversationId, intent: analysis.intent, nextAction: analysis.nextAction, evidenceMessageIds: analysis.evidenceMessageIds, source: "AI_REVIEWED", financialFactsConfirmed: false } } });
    const decision = await transaction.aIDecision.create({ data: { tenantId: actor.tenantId, executionId, reviewedById: actorId(actor), timelineId: timeline.id } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "AI_ANALYSIS_SAVED_TO_CRM", entityType: "AIDecision", entityId: decision.id, metadata: { conversationId, executionId, customerId }, idempotencyKey: `ai-crm:${executionId}` });
    return { decisionId: decision.id, alreadySaved: false };
  });
}
