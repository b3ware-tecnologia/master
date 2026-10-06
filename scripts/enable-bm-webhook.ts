import { db } from "@/lib/db";
import { configureMessagingWebhook } from "@/services/messaging-webhook-configuration";

async function main() {
  try {
    if (process.env.RAILWAY_ENVIRONMENT_NAME !== "staging" || process.env.RAILWAY_PROJECT_ID !== "ef26eb2e-9425-471c-a647-65d93c0b1b8a") throw new Error();
    const tenant = await db.tenant.findUnique({ where: { slug: "bm-credito" } });
    if (!tenant || tenant.status !== "ACTIVE") throw new Error();
    const connection = await db.messagingConnection.findFirst({ where: { tenantId: tenant.id } });
    if (!connection || connection.instanceName !== "bm_credito_staging" || connection.lastState !== "OPEN") throw new Error();
    const updated = await configureMessagingWebhook(tenant.id, { stagingOperator: true });
    console.log(JSON.stringify({ tenantId: tenant.id, instanceName: updated.instanceName, webhookConfigured: Boolean(updated.webhookConfiguredAt) }));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Staging webhook configuration failed"); process.exitCode = 1; });
