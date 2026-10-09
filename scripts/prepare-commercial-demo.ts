import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword } from "@/lib/auth/crypto";
import { syntheticPlaybook } from "./fixtures/commercial";

async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging");
  assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a");
  assert.equal(process.env.PREPARE_COMMERCIAL_DEMO, "true");
  assert.notEqual(process.env.AI_OUTREACH_ENABLED, "true");
  assert.notEqual(process.env.WHATSAPP_OUTBOUND_ENABLED, "true");
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "demonstracao-crm-staging" } });
  assert.equal(tenant.name, "Demonstração CRM — dados fictícios");
  const master = await db.membership.findFirstOrThrow({ where: { tenantId: tenant.id, role: "TENANT_MASTER", status: "ACTIVE" } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('commercial-demo-20261009', 0))`;
    if (!await tx.campaignPlaybook.findFirst({ where: { tenantId: tenant.id, name: "Vanessa — estratégia de demonstração" } })) {
      await tx.campaignPlaybook.create({ data: { tenantId: tenant.id, name: "Vanessa — estratégia de demonstração", instruction: "Demonstração: apresente Vanessa da BM Crédito, peça disponibilidade e entenda a necessidade sem prometer crédito. Não realizar envios.", interpretation: syntheticPlaybook, status: "APPROVED", version: 1, createdById: master.userId, approvedById: master.userId, approvedAt: new Date() } });
    }
    const sources = await tx.customerSource.findMany({ where: { tenantId: tenant.id, sourceType: "CRM_DEMO" }, orderBy: { sourceId: "asc" } });
    const stages = ["RESPONDED", "FOLLOW_UP", "HUMAN_HANDOFF", "NEGOTIATION"];
    for (const [index, source] of sources.entries()) {
      if (await tx.opportunity.findFirst({ where: { tenantId: tenant.id, customerId: source.customerId } })) continue;
      await tx.opportunity.create({ data: { tenantId: tenant.id, customerId: source.customerId, stage: stages[index % stages.length], summary: "Cenário fictício para testar o fluxo comercial. Nenhuma conversa ou proposta real foi realizada." } });
    }
    await tx.auditEvent.create({ data: { tenantId: tenant.id, actorUserId: master.userId, action: "COMMERCIAL_DEMO_PREPARED", entityType: "Tenant", entityId: tenant.id, metadata: { synthetic: true, messagesSent: 0 } } });
  });
  const password = createOpaqueToken();
  const user = await db.user.create({ data: { name: "Verificação visual temporária", email: `visual-${randomUUID()}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } });
  await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "TENANT_MASTER", status: "ACTIVE" } });
  // Private temporary credentials, never emitted into logs or committed.
  await writeFile("/tmp/bm-commercial-visual.json", JSON.stringify({ email: user.email, password, userId: user.id, tenantId: tenant.id, url: process.env.APP_URL }), { mode: 0o600 });
  console.log(JSON.stringify({ result: "PASS", tenantId: tenant.id, opportunities: await db.opportunity.count({ where: { tenantId: tenant.id } }), messagesSent: 0, temporaryAccountCreated: true }));
}
void main().catch(() => { console.error("COMMERCIAL_DEMO_FAILED"); process.exitCode = 1; }).finally(() => db.$disconnect());
