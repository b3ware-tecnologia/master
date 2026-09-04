import type { Prisma } from "@prisma/client";

type EventInput = { tenantId?: string; actorUserId?: string; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue; idempotencyKey?: string };

export async function recordEvent(transaction: Prisma.TransactionClient, input: EventInput) {
  const idempotencyKey = input.idempotencyKey ? `${input.tenantId ?? "platform"}:${input.idempotencyKey}` : undefined;
  if (idempotencyKey) {
    const existing = await transaction.auditEvent.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }
  await transaction.auditEvent.create({ data: { ...input, idempotencyKey } });
  await transaction.outboxEvent.create({ data: {
    tenantId: input.tenantId,
    eventType: input.action,
    aggregateType: input.entityType,
    aggregateId: input.entityId,
    payload: { entityId: input.entityId, metadata: input.metadata },
    idempotencyKey,
  } });
}
