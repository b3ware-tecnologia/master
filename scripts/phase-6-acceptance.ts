import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { roleCapabilities, type AuthorizationContext } from "@/domain/access";
import { getConversationAnalysis, requestConversationAnalysis, processAIExecution, saveAnalysisToCRM, processAIBatch } from "@/services/conversation-ai-service";

async function main() {
  try {
    const schema = process.env.ACCEPTANCE_ISOLATED_SCHEMA;
    assert(schema && /^phase6_acceptance_[a-f0-9]{32}$/.test(schema));
    assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
    const suffix = randomUUID();
    const tenant = await db.tenant.create({ data: { name: "Synthetic AI", slug: `ai-${suffix}` } });
    const foreign = await db.tenant.create({ data: { name: "Foreign AI", slug: `ai-foreign-${suffix}` } });
    const user = await db.user.create({ data: { name: "Synthetic Master", email: `ai-${suffix}@example.invalid`, status: "ACTIVE" } });
    const membership = await db.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: "TENANT_MASTER", status: "ACTIVE" } });
    const context: AuthorizationContext = { tenantId: tenant.id, userId: user.id, membershipId: membership.id, role: "TENANT_MASTER", accessScope: "TENANT", capabilities: roleCapabilities.TENANT_MASTER };
    const actor = { tenantId: tenant.id, context };
    const customer = await db.customer.create({ data: { tenantId: tenant.id, fullName: "Synthetic Customer", displayName: "Synthetic Customer" } });
    const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `ai_${suffix}` } });
    const conversation = await db.conversation.create({ data: { tenantId: tenant.id, connectionId: connection.id, remoteJid: "synthetic@lid", customerId: customer.id, lastMessageAt: new Date() } });
    const message = await db.conversationMessage.create({ data: { tenantId: tenant.id, connectionId: connection.id, conversationId: conversation.id, providerMessageId: "ai-1", direction: "INBOUND", kind: "TEXT", text: "synthetic-private-body", occurredAt: new Date() } });
    process.env.OPENAI_API_KEY = "";
    assert.equal((await getConversationAnalysis(actor, conversation.id)).configured, false);
    await assert.rejects(requestConversationAnalysis(actor, conversation.id), { code: "NOT_CONFIGURED" });
    assert.equal(await db.aIExecution.count(), 0);
    process.env.OPENAI_API_KEY = "synthetic-key-not-a-real-provider-credential";
    let calls = 0;
    const fake: typeof fetch = async () => {
      calls++;
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "Resumo sintético para revisão.", intent: "QUESTION", nextAction: "Esclarecer a solicitação.", evidenceMessageIds: [message.id], requiresHumanReview: true }) }] }], usage: { input_tokens: 90, output_tokens: 30 } });
    };
    const requested = await Promise.all([requestConversationAnalysis(actor, conversation.id), requestConversationAnalysis(actor, conversation.id)]);
    assert.equal(requested[0].id, requested[1].id);
    const executionId = requested[0].id;
    await Promise.all([processAIExecution(executionId, fake), processAIExecution(executionId, fake)]);
    assert.equal(calls, 1);
    assert.equal(await db.aIUsage.count(), 1);
    assert.equal((await getConversationAnalysis(actor, conversation.id)).execution?.status, "COMPLETED");
    assert.equal(await db.customerTimeline.count(), 0);
    const saved = await Promise.all([saveAnalysisToCRM(actor, conversation.id, executionId), saveAnalysisToCRM(actor, conversation.id, executionId)]);
    assert.equal(saved[0].decisionId, saved[1].decisionId);
    assert.equal(await db.customerTimeline.count(), 1);
    assert.equal(await db.aIDecision.count(), 1);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).relationshipState, "NEVER_CONTACTED");
    const stored = await db.aIExecution.findUniqueOrThrow({ where: { id: executionId } });
    const clone = (overrides: Partial<Prisma.AIExecutionUncheckedCreateInput> = {}) => db.aIExecution.create({ data: { tenantId: tenant.id, conversationId: conversation.id, requestedById: user.id, requesterRole: "TENANT_MASTER", model: stored.model, promptVersion: stored.promptVersion, fingerprint: stored.fingerprint, input: stored.input as Prisma.InputJsonValue, ...overrides } });
    const scopedFK = await clone({ status: "FAILED" });
    await assert.rejects(db.aIUsage.create({ data: { executionId: scopedFK.id, tenantId: foreign.id, inputTokens: 1, outputTokens: 1 } }));
    await assert.rejects(db.aIDecision.create({ data: { executionId: scopedFK.id, tenantId: foreign.id, reviewedById: user.id, timelineId: "synthetic-unused" } }));
    await assert.rejects(clone({ tenantId: foreign.id }));
    const stale = await clone({ status: "COMPLETED", result: stored.result as Prisma.InputJsonValue });
    await db.conversationMessage.create({ data: { tenantId: tenant.id, connectionId: connection.id, conversationId: conversation.id, providerMessageId: "ai-2", direction: "INBOUND", kind: "TEXT", text: "Outro assunto", occurredAt: new Date() } });
    assert.equal((await getConversationAnalysis(actor, conversation.id)).stale, true);
    await assert.rejects(saveAnalysisToCRM(actor, conversation.id, stale.id), /conversa mudou/);
    await assert.rejects(getConversationAnalysis({ tenantId: foreign.id, context }, conversation.id));
    await assert.rejects(getConversationAnalysis({ tenantId: tenant.id, context: { ...context, role: "CONSULTANT", capabilities: [] } }, conversation.id));
    const revoked = await clone();
    await db.membership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
    await processAIExecution(revoked.id, fake);
    assert.equal(calls, 1);
    assert.equal((await db.aIExecution.findUniqueOrThrow({ where: { id: revoked.id } })).errorCode, "ACCESS_REVOKED");
    await assert.rejects(saveAnalysisToCRM(actor, conversation.id, executionId));
    await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
    const invalid = await clone();
    await processAIExecution(invalid.id, async () => new Response("synthetic-private-error-body", { status: 401 }));
    assert.equal((await db.aIExecution.findUniqueOrThrow({ where: { id: invalid.id } })).errorCode, "CREDENTIALS_REJECTED");
    const completionRevoked = await clone();
    await processAIExecution(completionRevoked.id, async (url, options) => {
      await db.membership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
      return fake(url, options);
    });
    assert.equal((await db.aIExecution.findUniqueOrThrow({ where: { id: completionRevoked.id } })).errorCode, "ACCESS_REVOKED");
    await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
    const lost = await clone({ status: "RUNNING", startedAt: new Date(Date.now() - 180_000), lockToken: "synthetic-stale-lock" });
    await processAIBatch();
    assert.equal((await db.aIExecution.findUniqueOrThrow({ where: { id: lost.id } })).errorCode, "EXECUTION_INTERRUPTED");
    const history = await requestConversationAnalysis(actor, conversation.id);
    assert.equal(history.status, "QUEUED");
    // No processing of this queued fixture; it is isolated from the live worker.
    while (await db.aIExecution.count() < 10) await clone({ status: "FAILED" });
    await db.conversationMessage.create({ data: { tenantId: tenant.id, connectionId: connection.id, conversationId: conversation.id, providerMessageId: "ai-3", direction: "INBOUND", kind: "TEXT", text: "Nova mensagem", occurredAt: new Date() } });
    await assert.rejects(requestConversationAnalysis(actor, conversation.id), /10 análises/);
    for (const serialized of [JSON.stringify(await db.auditEvent.findMany()), JSON.stringify(await db.outboxEvent.findMany())]) {
      assert(!serialized.includes("synthetic-private-body")); assert(!serialized.includes("Resumo sintético")); assert(!serialized.includes("synthetic-key")); assert(!serialized.includes("synthetic-private-error-body"));
    }
    console.log(JSON.stringify({ result: "PASS", provider: "SIMULATED", concurrentRequestAndClaim: true, explicitIdempotentCRMReview: true, staleConversationBlocked: true, scopedAccessRevalidated: true, usagePersisted: true, interruptedCallsNotRetried: true, tenantBudgetEnforced: true, contentAbsentFromAuditOutbox: true, realProviderCalls: 0, messagesSent: 0 }));
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error("AI isolated acceptance failed:", error instanceof Error ? error.name : "Unknown"); process.exitCode = 1; });
