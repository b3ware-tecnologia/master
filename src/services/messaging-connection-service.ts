import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthorizationContext } from "@/domain/access";
import { AuthorizationError, ConflictError, NotFoundError } from "@/domain/errors";
import { MessagingProviderUnavailable, type MessagingProvider, type PairingMessagingProvider } from "@/domain/messaging-provider";
import { requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { configuredEvolutionProvider } from "@/integrations/evolution-provider";
import { recordEvent } from "@/services/events";

export const connectionSchema = z.object({ tenantId: z.string().min(1), instanceName: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) }).strict();
export async function registerEvolutionConnection(platformUserId: string, value: z.infer<typeof connectionSchema>) {
  const input = connectionSchema.parse(value);
  try { return await db.$transaction(async (transaction) => {
    if (!await transaction.user.findFirst({ where: { id: platformUserId, status: "ACTIVE", memberships: { some: { role: "PLATFORM_ADMIN", status: "ACTIVE", tenant: { status: "ACTIVE" } } } } })) throw new AuthorizationError("Platform administrator required");
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

async function requireActivePlatformUser(transaction: Prisma.TransactionClient, userId: string) {
  if (!await transaction.user.findFirst({ where: { id: userId, status: "ACTIVE", memberships: { some: { role: "PLATFORM_ADMIN", status: "ACTIVE", tenant: { status: "ACTIVE" } } } } })) throw new AuthorizationError("Platform administrator required");
}

type ConnectionActor = { userId: string; tenantId: string; context?: AuthorizationContext };
async function operateConnection(actor: ConnectionActor, action: "prepare" | "pair" | "check", provider?: PairingMessagingProvider) {
  if (actor.context) requireCapability(actor.context, "messaging.manage");
  const result = await db.$transaction(async (transaction) => {
    if (actor.context) {
      const membership = await transaction.membership.findFirst({ where: { id: actor.context.membershipId, tenantId: actor.tenantId, userId: actor.userId, role: "TENANT_MASTER", status: "ACTIVE", user: { status: "ACTIVE" }, tenant: { status: "ACTIVE" } } });
      if (!membership) throw new AuthorizationError("Active tenant master required");
    } else await requireActivePlatformUser(transaction, actor.userId);
    if (!await transaction.tenant.findFirst({ where: { id: actor.tenantId, status: "ACTIVE" } })) throw new NotFoundError();
    // Serialize remote provisioning/pairing across all web replicas. Persisted binding
    // reserves the provider name before external calls; retries reconcile that name.
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-connection:${actor.tenantId}`}, 0))`;
    const connection = await transaction.messagingConnection.findUnique({ where: { tenantId: actor.tenantId } });
    if (!connection) throw new NotFoundError();
    if (!connection.enabled) throw new ConflictError("Messaging connection is disabled");
    let state: string = "ERROR";
    let qrCode: string | null = null;
    let errorCode: MessagingProviderUnavailable["code"] | null = null;
    try {
      const selectedProvider = provider ?? configuredEvolutionProvider();
      if (action === "prepare") await selectedProvider.ensureInstance(connection.instanceName);
      if (action === "pair") {
        const pairing = await selectedProvider.requestPairing(connection.instanceName);
        state = pairing.state;
        qrCode = pairing.qrCode;
      } else state = await selectedProvider.getConnectionState(connection.instanceName);
    } catch (error) {
      if (!(error instanceof MessagingProviderUnavailable)) throw error;
      errorCode = error.code;
    }
    const updated = await transaction.messagingConnection.update({ where: { id: connection.id }, data: { lastState: state, lastErrorCode: errorCode, lastCheckedAt: new Date() } });
    await recordEvent(transaction, {
      tenantId: actor.tenantId, actorUserId: actor.userId,
      action: action === "prepare" ? (errorCode ? "MESSAGING_INSTANCE_PREPARATION_FAILED" : "MESSAGING_INSTANCE_PREPARED") : action === "pair" ? "MESSAGING_PAIRING_REQUESTED" : "MESSAGING_CONNECTION_CHECKED",
      entityType: "MessagingConnection", entityId: connection.id,
      metadata: { state, errorCode, qrAvailable: Boolean(qrCode) },
      idempotencyKey: action === "prepare" && !errorCode ? `instance-prepared:${connection.id}` : undefined,
    });
    return { connection: updated, qrCode, errorCode };
  }, { timeout: 40_000, maxWait: 15_000 });
  if (result.errorCode && action !== "check") throw new MessagingProviderUnavailable(result.errorCode);
  return { connection: result.connection, qrCode: result.qrCode };
}

export async function provisionEvolutionConnection(platformUserId: string, input: z.infer<typeof connectionSchema>, provider?: PairingMessagingProvider) {
  // Registration is durable even if the provider is temporarily unavailable.
  await registerEvolutionConnection(platformUserId, input);
  return (await operateConnection({ userId: platformUserId, tenantId: input.tenantId }, "prepare", provider)).connection;
}
export async function preparePlatformMessagingConnection(platformUserId: string, tenantId: string, provider?: PairingMessagingProvider) {
  return (await operateConnection({ userId: platformUserId, tenantId }, "prepare", provider)).connection;
}
export async function checkPlatformMessagingConnection(platformUserId: string, tenantId: string, provider?: PairingMessagingProvider) {
  return (await operateConnection({ userId: platformUserId, tenantId }, "check", provider)).connection;
}
export function pairPlatformMessagingConnection(platformUserId: string, tenantId: string, provider?: PairingMessagingProvider) {
  return operateConnection({ userId: platformUserId, tenantId }, "pair", provider);
}
export function pairMessagingConnection(context: AuthorizationContext, provider?: PairingMessagingProvider) {
  return operateConnection({ userId: context.userId, tenantId: context.tenantId, context }, "pair", provider);
}
