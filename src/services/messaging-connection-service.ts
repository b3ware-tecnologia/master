import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthorizationContext } from "@/domain/access";
import { AuthorizationError, ConflictError, NotFoundError } from "@/domain/errors";
import { MessagingProviderUnavailable, type MessagingProvider } from "@/domain/messaging-provider";
import { requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { configuredEvolutionProvider } from "@/integrations/evolution-provider";
import { recordEvent } from "@/services/events";

export const connectionSchema = z.object({ tenantId: z.string().min(1), instanceName: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) }).strict();
export async function registerEvolutionConnection(platformUserId: string, value: z.infer<typeof connectionSchema>) {
  const input = connectionSchema.parse(value);
  try { return await db.$transaction(async (transaction) => {
    if (!await transaction.user.findFirst({ where: { id: platformUserId, status: "ACTIVE", memberships: { some: { role: "PLATFORM_ADMIN", status: "ACTIVE" } } } })) throw new AuthorizationError("Platform administrator required");
    if (!await transaction.tenant.findFirst({ where: { id: input.tenantId, status: "ACTIVE" } })) throw new NotFoundError();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-connection:${input.tenantId}`}, 0))`;
    const existing = await transaction.messagingConnection.findUnique({ where: { tenantId: input.tenantId } });
    if (existing) { if (existing.instanceName !== input.instanceName) throw new ConflictError("Tenant already has a different messaging instance"); return existing; }
    const connection = await transaction.messagingConnection.create({ data: input });
    await recordEvent(transaction, { tenantId: input.tenantId, actorUserId: platformUserId, action: "MESSAGING_CONNECTION_REGISTERED", entityType: "MessagingConnection", entityId: connection.id, idempotencyKey: `connection-registered:${connection.id}` });
    return connection;
  }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("Messaging instance is already assigned"); throw error; }
}
export async function getMessagingConnection(context: AuthorizationContext) {
  requireCapability(context, "messaging.read");
  return db.messagingConnection.findUnique({ where: { tenantId: context.tenantId } });
}
export async function checkMessagingConnection(context: AuthorizationContext, provider?: MessagingProvider) {
  requireCapability(context, "messaging.manage");
  const connection = await getMessagingConnection(context);
  if (!connection) throw new NotFoundError();
  let state = "DISABLED"; let errorCode: string | null = null;
  if (connection.enabled) {
    try { state = await (provider ?? configuredEvolutionProvider()).getConnectionState(connection.instanceName); }
    catch (error) { if (!(error instanceof MessagingProviderUnavailable)) throw error; state = "ERROR"; errorCode = error.code; }
  }
  return db.$transaction(async (transaction) => {
    const updated = await transaction.messagingConnection.update({ where: { tenantId: context.tenantId }, data: { lastState: state, lastErrorCode: errorCode, lastCheckedAt: new Date() } });
    await recordEvent(transaction, { tenantId: context.tenantId, actorUserId: context.userId, action: "MESSAGING_CONNECTION_CHECKED", entityType: "MessagingConnection", entityId: connection.id, metadata: { state, errorCode } });
    return updated;
  });
}
