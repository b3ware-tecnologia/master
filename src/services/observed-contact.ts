import type { Prisma, MessageDirection } from "@prisma/client";

export async function recordObservedContact(transaction: Prisma.TransactionClient, tenantId: string, customerId: string, direction: MessageDirection, occurredAt: Date) {
  const field = direction === "INBOUND" ? "lastInboundAt" : "lastOutboundAt";
  await transaction.customer.updateMany({ where: { id: customerId, tenantId, status: "ACTIVE", OR: [{ [field]: null }, { [field]: { lt: occurredAt } }] }, data: { [field]: occurredAt } });
  await transaction.customer.updateMany({ where: { id: customerId, tenantId, status: "ACTIVE", OR: [{ lastContactAt: null }, { lastContactAt: { lt: occurredAt } }] }, data: { lastContactAt: occurredAt } });
  await transaction.customer.updateMany({ where: { id: customerId, tenantId, status: "ACTIVE", relationshipState: "NEVER_CONTACTED" }, data: { relationshipState: "CONTACTED" } });
}
