import { checkDatabaseConnection } from "@/lib/db";
import { checkRedisConnection } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { processOutboxBatch } from "@/services/outbox-service";
import { processImportBatch } from "@/services/import-service";
import { processAIBatch } from "@/services/conversation-ai-service";
import { processOutboundBatch } from "@/services/outbound-service";
import { processMessagingReceiptBatch } from "@/services/messaging-receipt-service";
import { processConnectionHealthBatch } from "@/services/messaging-health-service";
import { processOutreachBatch } from "@/services/outreach-service";
import { processCommercialAIBatch } from "@/services/commercial-ai-service";

export type WorkerDependencies = {
  checkDatabase: () => Promise<void>;
  checkRedis: () => Promise<void>;
  waitForShutdown: () => Promise<void>;
};

async function waitForShutdown() {
  for (;;) {
    await processMessagingReceiptBatch();
    await processConnectionHealthBatch();
    await processOutboxBatch();
    await processImportBatch();
    await processAIBatch();
    await processCommercialAIBatch();
    await processOutreachBatch();
    await processOutboundBatch();
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

export async function startWorker(dependencies: WorkerDependencies = {
  checkDatabase: checkDatabaseConnection,
  checkRedis: checkRedisConnection,
  waitForShutdown,
}) {
  await dependencies.checkDatabase();
  logger.info({ service:"worker", event:"postgres_connected" });
  await dependencies.checkRedis();
  logger.info({ service:"worker", event:"redis_connected" });
  logger.info({ service:"worker", event:"worker_started" });
  await dependencies.waitForShutdown();
}

