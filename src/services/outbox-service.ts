import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { assertTestHooksAllowed } from "@/services/test-hooks";

type OutboxDatabase = Pick<typeof db, "outboxEvent">;
type OutboxOptions = { eventId?: string; afterClaim?: (eventId: string) => Promise<void> };

export type OutboxBatchResult = { selected: number; claimed: number; processed: number; claimConflicts: number };

export async function processOutboxBatchDetailed(limit = 25, database: OutboxDatabase = db, options: OutboxOptions = {}): Promise<OutboxBatchResult> {
  assertTestHooksAllowed(Boolean(options.afterClaim));
  const staleLock = new Date(Date.now() - Number(process.env.OUTBOX_STALE_TIMEOUT_MS ?? 300_000));
  const events = await database.outboxEvent.findMany({ where: { id: options.eventId, processedAt: null, OR: [{ lockedAt: null }, { lockedAt: { lt: staleLock } }] }, orderBy: { createdAt: "asc" }, take: limit });
  const result = { selected: events.length, claimed: 0, processed: 0, claimConflicts: 0 };
  for (const event of events) {
    const locked = await database.outboxEvent.updateMany({ where: { id: event.id, processedAt: null, OR: [{ lockedAt: null }, { lockedAt: { lt: staleLock } }] }, data: { lockedAt: new Date(), processingAt: new Date(), attempts: { increment: 1 } } });
    if (locked.count !== 1) { result.claimConflicts += 1; continue; }
    result.claimed += 1;
    try {
      await options.afterClaim?.(event.id);
      await database.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), lockedAt: null, lastError: null } });
      result.processed += 1;
      logger.info({ event: "outbox_processed", tenantId: event.tenantId, outboxEventId: event.id });
    } catch (error) {
      await database.outboxEvent.update({ where: { id: event.id }, data: { lockedAt: null, lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" } });
    }
  }
  return result;
}

export async function processOutboxBatch(limit = 25, database: OutboxDatabase = db) {
  return (await processOutboxBatchDetailed(limit, database)).selected;
}
