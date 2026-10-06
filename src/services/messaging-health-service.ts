import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { configuredEvolutionProvider } from "@/integrations/evolution-provider";
import type { MessagingProvider } from "@/domain/messaging-provider";
import { assertTestHooksAllowed } from "@/services/test-hooks";
import { recordEvent } from "@/services/events";

export async function processConnectionHealthBatch(provider?: MessagingProvider) {
  assertTestHooksAllowed(!!provider);
  if (!provider && (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY)) return 0;
  const due = await db.messagingConnection.findMany({ where: { enabled: true, tenant: { status: "ACTIVE" }, nextHealthAt: { lte: new Date() } }, orderBy: { nextHealthAt: "asc" }, take: 10 });
  for (const connection of due) {
    const token = randomUUID();
    if (!(await db.messagingConnection.updateMany({ where: { id: connection.id, nextHealthAt: connection.nextHealthAt }, data: { nextHealthAt: new Date(Date.now() + 120_000), healthLockToken: token } })).count) continue;
    let state = "ERROR";
    try { state = await (provider ?? configuredEvolutionProvider()).getConnectionState(connection.instanceName); } catch { /* Health records a technical failure, never credentials or provider payloads. */ }
    await db.$transaction(async (transaction) => {
      const current = await transaction.messagingConnection.findFirst({ where: { id: connection.id, enabled: true, healthLockToken: token, tenant: { status: "ACTIVE" } } });
      if (!current) return;
      const healthy = state === "OPEN"; const failures = healthy ? 0 : current.consecutiveFailures + 1;
      const circuitState = failures >= 3 ? "OPEN" : "CLOSED";
      await transaction.messagingConnection.update({ where: { id: current.id }, data: { lastState: state, lastCheckedAt: new Date(), healthStatus: healthy ? "HEALTHY" : "UNAVAILABLE", consecutiveFailures: failures, circuitState, pausedUntil: circuitState === "OPEN" ? new Date(Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(failures - 3, 4))) : null, nextHealthAt: new Date(Date.now() + 60_000), healthLockToken: null } });
      if (current.circuitState !== circuitState) await recordEvent(transaction, { tenantId: current.tenantId, action: `MESSAGING_CIRCUIT_${circuitState}`, entityType: "MessagingConnection", entityId: current.id });
    });
  }
  return due.length;
}
