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

// For newly-created aggregates in one serialized transaction. Keys must be unique;
// a conflict rolls back the entire batch, including the messages and receipt.
export async function recordNewEvents(transaction: Prisma.TransactionClient, inputs: EventInput[]) {
  if (!inputs.length) return;
  const events = inputs.map((input) => ({ ...input, idempotencyKey: input.idempotencyKey ? `${input.tenantId ?? "platform"}:${input.idempotencyKey}` : undefined }));
  await transaction.auditEvent.createMany({ data: events });
  await transaction.outboxEvent.createMany({ data: events.map((input) => ({ tenantId: input.tenantId, eventType: input.action, aggregateType: input.entityType, aggregateId: input.entityId, payload: { entityId: input.entityId, metadata: input.metadata }, idempotencyKey: input.idempotencyKey })) });
}
