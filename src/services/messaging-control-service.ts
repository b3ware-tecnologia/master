import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { recordEvent } from "@/services/events";
const actionSchema = z.strictObject({ action: z.enum(["default", "enable", "disable", "retry-receipt"]), receiptId: z.string().max(100).optional() });
export async function connectionMetrics(actor: CRMActor, connectionId: string) {
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "messaging.read");
    if (!await transaction.messagingConnection.findFirst({ where: { id: connectionId, tenantId: actor.tenantId } })) throw new NotFoundError();
    const [receipts, deliveries, deadLetters, recent] = await Promise.all([
      transaction.messagingReceipt.groupBy({ by: ["status"], where: { connectionId, tenantId: actor.tenantId }, _count: { _all: true } }),
      transaction.conversationMessage.groupBy({ by: ["deliveryState"], where: { connectionId, tenantId: actor.tenantId, direction: "OUTBOUND" }, _count: { _all: true } }),
      transaction.messagingReceipt.findMany({ where: { connectionId, tenantId: actor.tenantId, status: "DEAD_LETTER" }, take: 20, orderBy: { createdAt: "desc" }, select: { id: true, errorCode: true, attempts: true, createdAt: true } }),
      transaction.messagingReceipt.findMany({ where: { connectionId, tenantId: actor.tenantId, status: "PROCESSED", processedAt: { not: null } }, orderBy: { processedAt: "desc" }, take: 200, select: { createdAt: true, processedAt: true } }),
    ]);
    const latency = recent.map((item) => item.processedAt!.valueOf() - item.createdAt.valueOf()).sort((a, b) => a - b);
    return { receipts: Object.fromEntries(receipts.map((item) => [item.status, item._count._all])), deliveries: Object.fromEntries(deliveries.map((item) => [item.deliveryState, item._count._all])), latencySamples: recent.length, latencyP95Ms: latency.length ? latency[Math.min(latency.length - 1, Math.floor(latency.length * .95))] : null, deadLetters };
  });
}
export async function controlConnection(actor: CRMActor, connectionId: string, input: z.infer<typeof actionSchema>) {
  const data = actionSchema.parse(input);
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "messaging.manage");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-connection:${actor.tenantId}`}, 0))`;
    const connection = await transaction.messagingConnection.findFirst({ where: { id: connectionId, tenantId: actor.tenantId } }); if (!connection) throw new NotFoundError();
    if (data.action === "default") { await transaction.messagingConnection.updateMany({ where: { tenantId: actor.tenantId, isDefault: true }, data: { isDefault: false } }); await transaction.messagingConnection.update({ where: { id: connectionId }, data: { isDefault: true } }); }
    else if (data.action === "retry-receipt") {
      if (!data.receiptId || !connection.enabled) throw new ConflictError("Ative a conexão e selecione um recebimento com falha.");
      if (!(await transaction.messagingReceipt.updateMany({ where: { id: data.receiptId, connectionId, tenantId: actor.tenantId, status: "DEAD_LETTER" }, data: { status: "QUEUED", attempts: 0, errorCode: null, nextAttemptAt: new Date(), lockToken: null, lockedAt: null } })).count) throw new ConflictError("O recebimento mudou.");
    } else await transaction.messagingConnection.update({ where: { id: connectionId }, data: { enabled: data.action === "enable", ...(data.action === "enable" ? { nextHealthAt: new Date() } : {}) } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: "context" in actor ? actor.context.userId : actor.platformUserId, action: `MESSAGING_CONTROL_${data.action.toUpperCase().replaceAll("-", "_")}`, entityType: "MessagingConnection", entityId: connectionId, metadata: { receiptId: data.receiptId ?? null } });
    return transaction.messagingConnection.findUniqueOrThrow({ where: { id: connectionId } });
  });
}
