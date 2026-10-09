import type { Prisma } from "@prisma/client";
export async function lockCRMCustomer(transaction: Prisma.TransactionClient, tenantId: string, customerId: string) {
  await transaction.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "crm-customer:" + tenantId + ":" + customerId);
}
export async function lockMessagingTarget(transaction: Prisma.TransactionClient, tenantId: string, customerId?: string) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-policy:${tenantId}`}, 0))`;
  if (customerId) await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-customer:${tenantId}:${customerId}`}, 0))`;
}
