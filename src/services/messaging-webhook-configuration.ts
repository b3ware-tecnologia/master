import { db } from "@/lib/db";
import { AuthorizationError, ConflictError, NotFoundError } from "@/domain/errors";
import { configuredEvolutionProvider } from "@/integrations/evolution-provider";
import { connectionWebhookToken } from "@/integrations/evolution-webhook";
import { recordEvent } from "@/services/events";

export async function configureMessagingWebhook(tenantId: string, actor: { platformUserId: string } | { stagingOperator: true }) {
  if ("stagingOperator" in actor && (process.env.RAILWAY_ENVIRONMENT_NAME !== "staging" || process.env.RAILWAY_PROJECT_ID !== "ef26eb2e-9425-471c-a647-65d93c0b1b8a")) throw new AuthorizationError();
  return db.$transaction(async (transaction) => {
    if ("platformUserId" in actor && !await transaction.user.findFirst({ where: { id: actor.platformUserId, status: "ACTIVE", memberships: { some: { role: "PLATFORM_ADMIN", status: "ACTIVE" } } } })) throw new AuthorizationError();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-connection:${tenantId}`}, 0))`;
    const connection = await transaction.messagingConnection.findUnique({ where: { tenantId }, include: { tenant: { select: { status: true } } } });
    if (!connection || connection.tenant.status !== "ACTIVE") throw new NotFoundError();
    if (!connection.enabled) throw new ConflictError("Messaging connection disabled");
    const base = new URL(process.env.APP_URL!);
    const destination = new URL(`/api/webhooks/evolution/${connection.id}`, base).toString();
    await configuredEvolutionProvider().configureWebhook(connection.instanceName, destination, connectionWebhookToken(connection.id));
    const updated = await transaction.messagingConnection.update({ where: { id: connection.id }, data: { webhookConfiguredAt: new Date() } });
    await recordEvent(transaction, { tenantId, actorUserId: "platformUserId" in actor ? actor.platformUserId : undefined, action: "MESSAGING_WEBHOOK_CONFIGURED", entityType: "MessagingConnection", entityId: connection.id, metadata: { source: "platformUserId" in actor ? "platform" : "railway-operator", enabled: true } });
    return updated;
  }, { timeout: 30_000, maxWait: 15_000 });
}
