import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { roleCapabilities, roleAccessScope } from "@/domain/access";
import { createPlan } from "@/services/relationship-plan-service";
import { saveCommunicationPreference, saveMessagingPolicy } from "@/services/messaging-governance";
async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging"); assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a"); assert.equal(process.env.CREATE_OUTBOUND_DEMO, "true"); assert.notEqual(process.env.WHATSAPP_OUTBOUND_ENABLED, "true");
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "demonstracao-crm-staging" } }); assert.equal(tenant.id, "cmuvr9q670000p93yezf0kxg8"); assert.equal(tenant.name, "Demonstração CRM — dados fictícios");
  assert.equal(await db.messagingConnection.count({ where: { tenantId: tenant.id } }), 0);
  const membership = await db.membership.findFirstOrThrow({ where: { tenantId: tenant.id, role: "TENANT_MASTER", status: "ACTIVE", user: { email: "crm-demo-0@example.invalid", passwordHash: null, status: "ACTIVE" } } });
  const actor = { tenantId: tenant.id, context: { tenantId: tenant.id, userId: membership.userId, membershipId: membership.id, role: membership.role, capabilities: roleCapabilities[membership.role], accessScope: roleAccessScope[membership.role] } };
  const source = await db.customerSource.findFirstOrThrow({ where: { tenantId: tenant.id, sourceType: "CRM_DEMO", sourceId: "demo-1" }, include: { customer: true } }); assert(source.customer.fullName.startsWith("Cliente fictício"));
  await db.customerIdentifier.upsert({ where: { tenantId_type_normalizedValue: { tenantId: tenant.id, type: "PHONE", normalizedValue: "15555550101" } }, update: {}, create: { tenantId: tenant.id, customerId: source.customerId, type: "PHONE", normalizedValue: "15555550101", displayValue: "Número fictício reservado para demonstração", verification: "CONFIRMED" } });
  if (!await db.messagingPolicy.findUnique({ where: { tenantId: tenant.id } })) await saveMessagingPolicy(actor, { timeZone: "America/Sao_Paulo", startHour: 9, endHour: 18, minIntervalMinutes: 1440, enabledChannels: ["WHATSAPP"] });
  if (!await db.communicationPreference.findUnique({ where: { tenantId_customerId_channel: { tenantId: tenant.id, customerId: source.customerId, channel: "WHATSAPP" } } })) await saveCommunicationPreference(actor, source.customerId, { channel: "WHATSAPP", consent: "OPTED_IN", evidence: "Preferência inteiramente fictícia para demonstração, sem autorização de pessoa real." });
  const requestKey = "10000000-0000-4000-8000-000000000010";
  let plan = await db.relationshipPlan.findUnique({ where: { tenantId_requestKey: { tenantId: tenant.id, requestKey } } });
  if (!plan) plan = await createPlan(actor, { requestKey, customerId: source.customerId, purpose: "Revisão de envio — demonstração fictícia", message: "Olá! Esta é uma mensagem fictícia para demonstrar a revisão de um plano de relacionamento. Nenhum envio real será realizado nesta demonstração.", channel: "WHATSAPP", scheduledAt: new Date(Date.now() + 60_000).toISOString() });
  console.log(JSON.stringify({ result: "PASS", demoOnly: true, tenantId: tenant.id, planId: plan.id, sendEnabled: false, connectionConfigured: false, actualMessagesSent: 0 }));
}
main().finally(() => db.$disconnect()).catch(() => { console.error("FAIL OUTBOUND_DEMO_BOOTSTRAP"); process.exitCode = 1; });
