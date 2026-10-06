import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeEvolutionWebhook, verifyWebhookToken, WebhookRequestError, type NormalizedWebhook } from "@/integrations/evolution-webhook";
import { applyEvolutionWebhook, authenticateEvolutionWebhook } from "@/services/conversation-service";

export async function enqueueEvolutionWebhook(connectionId: string, token: string | null, value: unknown) {
  verifyWebhookToken(connectionId, token);
  await authenticateEvolutionWebhook(connectionId, token);
  const event = normalizeEvolutionWebhook(value);
  const connection = await db.messagingConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (event.instanceName !== connection.instanceName) throw new WebhookRequestError(403, "Webhook instance mismatch");
  if (event.type === "ignored") return { queued: false, ignored: true };
  // Persist only normalized fields: provider credentials, media URLs and binary data never enter the queue.
  const payload = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
  const identity = event.type === "deliveries" ? { instanceName: event.instanceName, type: event.type, deliveries: event.deliveries.map(({ providerMessageId, state }) => ({ providerMessageId, state })) } : payload;
  const eventKey = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  // Prisma's emulated empty-update upsert can race. INSERT ... ON CONFLICT is atomic across replicas.
  await db.messagingReceipt.createMany({ data: [{ id: randomUUID(), tenantId: connection.tenantId, connectionId, eventKey, kind: event.type, payload }], skipDuplicates: true });
  const receipt = await db.messagingReceipt.findUniqueOrThrow({ where: { connectionId_eventKey: { connectionId, eventKey } }, select: { id: true, status: true } });
  return { queued: true, ignored: false, receiptId: receipt.id, status: receipt.status };
}
function decode(payload: Prisma.JsonValue): NormalizedWebhook {
  const event = payload as unknown as NormalizedWebhook;
  if (event.type === "messages") return { ...event, messages: event.messages.map((item) => ({ ...item, occurredAt: new Date(item.occurredAt) })) };
  if (event.type === "deliveries") return { ...event, deliveries: event.deliveries.map((item) => ({ ...item, occurredAt: new Date(item.occurredAt) })) };
  if (event.type === "connection") return { ...event, occurredAt: new Date(event.occurredAt) };
  return event;
}
export async function processMessagingReceiptBatch(limit = 50) {
  await db.messagingReceipt.updateMany({ where: { status: "PROCESSING", lockedAt: { lt: new Date(Date.now() - 120_000) } }, data: { status: "QUEUED", lockToken: null, lockedAt: null } });
  const candidates = await db.messagingReceipt.findMany({ where: { status: "QUEUED", nextAttemptAt: { lte: new Date() } }, take: Math.min(limit, 200), orderBy: { createdAt: "asc" } });
  let processed = 0;
  for (const candidate of candidates) {
    const lockToken = randomUUID();
    const claim = await db.messagingReceipt.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "PROCESSING", lockToken, lockedAt: new Date(), attempts: { increment: 1 } } });
    if (!claim.count) continue;
    try {
      await db.$transaction(async (transaction) => {
        // Acquire a row lock before effects. Recovery cannot invalidate a running transaction's lease.
        if (!(await transaction.messagingReceipt.updateMany({ where: { id: candidate.id, status: "PROCESSING", lockToken }, data: { status: "PROCESSING" } })).count) return;
        await applyEvolutionWebhook(transaction, candidate.connectionId, decode(candidate.payload));
        await transaction.messagingReceipt.update({ where: { id: candidate.id }, data: { status: "PROCESSED", processedAt: new Date(), errorCode: null, lockToken: null, lockedAt: null } });
      }, { timeout: 30_000, maxWait: 10_000 });
      processed++;
    } catch (error) {
      const permanent = error instanceof WebhookRequestError || candidate.attempts >= 4;
      await db.messagingReceipt.updateMany({ where: { id: candidate.id, status: "PROCESSING", lockToken }, data: { status: permanent ? "DEAD_LETTER" : "QUEUED", errorCode: error instanceof WebhookRequestError ? "BINDING_REVOKED" : "PROCESSING_FAILED", nextAttemptAt: new Date(Date.now() + 1000 * 2 ** Math.min(candidate.attempts + 1, 6)), lockToken: null, lockedAt: null } });
    }
  }
  return processed;
}
