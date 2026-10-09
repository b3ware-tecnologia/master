import { createHash, randomUUID } from "node:crypto";
import type { CommercialAIJob, Prisma } from "@prisma/client";
import { AIUnavailable } from "@/domain/conversation-ai";
import { playbookInterpretationSchema } from "@/domain/commercial";
import { roleCapabilities, roleAccessScope } from "@/domain/access";
import { ConflictError } from "@/domain/errors";
import { db } from "@/lib/db";
import { aiConfiguration, configuredAIModel } from "@/integrations/ai-gateway";
import { ConciergePromptVersion, structuredCommercialResponse, validateConciergeDecision, type ConciergeInput } from "@/integrations/credit-concierge";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";
import { commercialCustomerScope, currentCreditKnowledge } from "@/services/commercial-service";
import { lockCRMCustomer } from "@/services/messaging-locks";
import { recordEvent } from "@/services/events";
import { assertTestHooksAllowed } from "@/services/test-hooks";
import { buildAgentSimulationInput } from "@/domain/agent-simulation";

async function jobActor(tx: Prisma.TransactionClient, job: CommercialAIJob): Promise<CRMActor> {
  if (!job.membershipId) return { tenantId: job.tenantId, platformUserId: job.requestedById };
  const member = await tx.membership.findUniqueOrThrow({ where: { id: job.membershipId } });
  return { tenantId: job.tenantId, context: { userId: job.requestedById, tenantId: job.tenantId, membershipId: member.id, role: member.role, capabilities: roleCapabilities[member.role], accessScope: roleAccessScope[member.role] } };
}
async function source(tx: Prisma.TransactionClient, job: CommercialAIJob) {
  const actor = await jobActor(tx, job); await authorizeCRMActor(tx, actor, job.kind === "COPILOT" ? "crm.update" : "plans.manage");
  const payload = job.payload as { message: string; simulationStage?: "INITIAL" | "REPLY" };
  let input: unknown; let entityVersion: number;
  if (job.kind === "PLAYBOOK") { const playbook = await tx.campaignPlaybook.findFirstOrThrow({ where: { id: job.entityId, tenantId: job.tenantId, status: { not: "APPROVED" } } }); input = { instruction: playbook.instruction }; entityVersion = playbook.version; }
  else {
    const knowledge = await currentCreditKnowledge(tx, job.tenantId);
    if (job.kind === "TEST_AGENT") { const playbook = await tx.campaignPlaybook.findFirstOrThrow({ where: { id: job.entityId, tenantId: job.tenantId, status: "APPROVED" } }); input = buildAgentSimulationInput(payload, playbookInterpretationSchema.parse(playbook.interpretation), knowledge); entityVersion = playbook.version; }
    else { const item = await tx.opportunity.findFirstOrThrow({ where: { id: job.entityId, tenantId: job.tenantId, customer: commercialCustomerScope(actor) }, include: { customer: { include: { facts: { where: { verification: "CONFIRMED", key: { in: ["city", "occupation", "interest", "goal", "cidade", "profissao", "objetivo"] } }, take: 20, orderBy: { id: "asc" } } } }, campaign: { include: { playbook: true } } } }); const messages = item.conversationId ? await tx.conversationMessage.findMany({ where: { tenantId: job.tenantId, conversationId: item.conversationId }, take: 30, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], select: { id: true, direction: true, kind: true, text: true } }) : []; input = { stage: "COPILOT", objective: "Propor resumo e próximo passo para revisão do atendente. Nunca enviar ou executar.", customer: { firstName: item.customer.fullName.split(" ")[0], facts: item.customer.facts.map((v) => ({ id: v.id, key: v.key, value: v.value.slice(0,300) })) }, messages: messages.reverse().map((v) => ({ ...v, text: v.text?.slice(0,2000) ?? null })), memory: item.summary, knowledge, ...(item.campaign?.playbook ? { playbook: playbookInterpretationSchema.parse(item.campaign.playbook.interpretation) } : {}) }; entityVersion = item.version; }
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ input, entityVersion })).digest("hex");
  if (job.kind !== "PLAYBOOK") input = { ...(input as ConciergeInput), now: new Date().toISOString() };
  return { actor, input, fingerprint, entityVersion };
}
export async function processCommercialAIBatch(generator?: typeof structuredCommercialResponse) {
  assertTestHooksAllowed(!!generator); if (!aiConfiguration().configured) return 0;
  await db.commercialAIJob.updateMany({ where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 300_000) } }, data: { status: "FAILED", errorCode: "WORKER_INTERRUPTED", lockToken: null } });
  // Requests made before a key existed are not silently activated later. Create a new authorized request.
  const jobs = await db.commercialAIJob.findMany({ where: { status: "QUEUED", tenant: { status: "ACTIVE" } }, take: 3, orderBy: { createdAt: "asc" } }); let processed = 0;
  for (const job of jobs) {
    const token = randomUUID();
    if (!(await db.commercialAIJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date(), lockToken: token, model: configuredAIModel(), promptVersion: ConciergePromptVersion } })).count) continue;
    try {
      const before = await db.$transaction((tx) => source(tx, job)); const output = await (generator ?? structuredCommercialResponse)(job.kind === "PLAYBOOK" ? "PLAYBOOK" : "CONCIERGE", before.input);
      await db.$transaction(async (tx) => {
        if (job.kind === "PLAYBOOK") await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`playbook:${job.tenantId}:${job.entityId}`}, 0))`;
        if (job.kind === "COPILOT") { const opportunity = await tx.opportunity.findFirstOrThrow({ where: { id: job.entityId, tenantId: job.tenantId } }); await lockCRMCustomer(tx, job.tenantId, opportunity.customerId); }
        const current = await source(tx, job); if (current.fingerprint !== before.fingerprint) throw new ConflictError("CONTEXT_CHANGED");
        if (!await tx.commercialAIJob.findFirst({ where: { id: job.id, status: "RUNNING", lockToken: token } })) return;
        if (job.kind === "PLAYBOOK") { const result = playbookInterpretationSchema.parse(output.result); if (!(await tx.campaignPlaybook.updateMany({ where: { id: job.entityId, tenantId: job.tenantId, version: before.entityVersion, status: { not: "APPROVED" } }, data: { interpretation: result, status: "INTERPRETED", version: { increment: 1 } } })).count) throw new ConflictError("PLAYBOOK_CHANGED"); }
        const decision = job.kind === "PLAYBOOK" ? playbookInterpretationSchema.parse(output.result) : validateConciergeDecision(output.result, current.input as ConciergeInput);
        await tx.commercialAIJob.update({ where: { id: job.id }, data: { status: "COMPLETED", lockToken: null, result: { decision, tools: output.trace, jev: output.jev ?? null, simulation: job.kind === "TEST_AGENT", writesExecuted: false, messagesSent: 0 }, inputTokens: output.inputTokens, outputTokens: output.outputTokens, completedAt: new Date() } });
        await recordEvent(tx, { tenantId: job.tenantId, actorUserId: job.requestedById, action: "COMMERCIAL_AI_JOB_COMPLETED", entityType: "CommercialAIJob", entityId: job.id, metadata: { kind: job.kind, tools: output.trace.map((v) => v.name), promptVersion: ConciergePromptVersion }, idempotencyKey: `commercial-job:${job.id}` });
      }); processed++;
    } catch (error) { await db.commercialAIJob.updateMany({ where: { id: job.id, status: "RUNNING", lockToken: token }, data: { status: "FAILED", lockToken: null, errorCode: error instanceof AIUnavailable ? error.code : "ACCESS_OR_CONTEXT_CHANGED", completedAt: new Date() } }); }
  }
  return processed;
}

