import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "@/domain/errors";
export async function resolveMessagingConnection(database: Pick<Prisma.TransactionClient, "messagingConnection">, tenantId: string, connectionId?: string) {
  if (connectionId) {
    const selected = await database.messagingConnection.findFirst({ where: { id: connectionId, tenantId } });
    if (!selected) throw new NotFoundError();
    return selected;
  }
  const primary = await database.messagingConnection.findFirst({ where: { tenantId, isDefault: true } });
  if (primary) return primary;
  const available = await database.messagingConnection.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, take: 2 });
  if (available.length > 1) throw new ConflictError("Selecione uma conexão WhatsApp ou defina a principal.");
  return available[0] ?? null;
}
