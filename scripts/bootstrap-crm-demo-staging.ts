import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { roleAccessScope, roleCapabilities } from "@/domain/access";
import { createCRMCustomer, createCRMCase, assignCustomer, changeCRMCase } from "@/services/crm-service";

async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging"); assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a"); assert.equal(process.env.CREATE_CRM_DEMO, "true");
  try {
    const result = await db.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('crm-staging-demo', 0))`;
      const existing = await transaction.tenant.findUnique({ where: { slug: "demonstracao-crm-staging" } });
      if (existing) { assert.equal(existing.name, "Demonstração CRM — dados fictícios"); return { tenant: existing, existing: true }; }
      const tenant = await transaction.tenant.create({ data: { name: "Demonstração CRM — dados fictícios", slug: "demonstracao-crm-staging" } });
      const team = await transaction.team.create({ data: { tenantId: tenant.id, name: "Equipe de teste BM Crédito" } });
      const roles = ["TENANT_MASTER", "TENANT_MANAGER", "CONSULTANT", "CONSULTANT"] as const;
      const names = ["Administrador de teste", "Gestor de teste", "Ana — consultora de teste", "Bruno — consultor de teste"];
      for (let i = 0; i < roles.length; i++) {
        const user = await transaction.user.create({ data: { email: `crm-demo-${i}@example.invalid`, name: names[i], status: "ACTIVE" } });
        await transaction.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: roles[i], status: "ACTIVE" } });
        await transaction.teamMember.create({ data: { userId: user.id, tenantId: tenant.id, teamId: team.id } });
      }
      return { tenant, existing: false };
    });
    const members = await db.membership.findMany({ where: { tenantId: result.tenant.id }, include: { user: true }, orderBy: { user: { email: "asc" } } });
    const master = members.find((member) => member.role === "TENANT_MASTER")!; assert(master);
    const actor = { tenantId: result.tenant.id, context: { tenantId: result.tenant.id, userId: master.userId, membershipId: master.id, role: master.role, accessScope: roleAccessScope[master.role], capabilities: roleCapabilities[master.role] } };
    const team = await db.team.findFirstOrThrow({ where: { tenantId: result.tenant.id } });
    const consultants = members.filter((member) => member.role === "CONSULTANT"); assert.equal(consultants.length, 2);
    const fixtures = [
      { key: "demo-1", name: "Cliente fictício 01 — Marina", title: "Esclarecer solicitação de atendimento", consultant: consultants[0], progress: true, schedule: true },
      { key: "demo-2", name: "Cliente fictício 02 — Paulo", title: "Retorno sobre informações recebidas", consultant: consultants[0], progress: true, waiting: true },
      { key: "demo-3", name: "Cliente fictício 03 — Carla", title: "Primeiro atendimento de demonstração", consultant: consultants[1] },
      { key: "demo-4", name: "Cliente fictício 04 — Lucas", title: "Cliente aguardando distribuição", consultant: null },
    ];
    for (const fixture of fixtures) {
      const stored = await db.customerSource.findFirst({ where: { tenantId: result.tenant.id, sourceType: "CRM_DEMO", sourceId: fixture.key } });
      if (stored) continue;
      const customer = await createCRMCustomer(actor, { requestKey: randomUUID(), fullName: fixture.name });
      const item = await createCRMCase(actor, { requestKey: randomUUID(), customerId: customer.id, title: fixture.title, description: "Registro fictício para demonstrar o CRM. Não representa uma pessoa ou operação de crédito real." });
      await assignCustomer(actor, customer.id, { teamId: team.id, assignedMembershipId: fixture.consultant?.id ?? null, expectedVersion: null });
      let current = item;
      if (fixture.progress) current = await changeCRMCase(actor, item.id, { action: "transition", requestKey: randomUUID(), expectedVersion: current.version, status: "IN_PROGRESS", note: "Atendimento de demonstração iniciado. Dados inteiramente fictícios." });
      if (fixture.waiting) current = await changeCRMCase(actor, item.id, { action: "transition", requestKey: randomUUID(), expectedVersion: current.version, status: "WAITING_CUSTOMER", note: "Simulação: aguardando uma informação do cliente fictício." });
      if (fixture.schedule) await changeCRMCase(actor, item.id, { action: "schedule", requestKey: randomUUID(), expectedVersion: current.version, dueAt: new Date(Date.now() + 24 * 3600_000).toISOString() });
      await db.customerSource.create({ data: { tenantId: result.tenant.id, customerId: customer.id, sourceType: "CRM_DEMO", sourceId: fixture.key } });
    }
    assert.equal(await db.messagingConnection.count({ where: { tenantId: result.tenant.id } }), 0);
    console.log(JSON.stringify({ result: "PASS", tenantId: result.tenant.id, demoOnly: true, cases: await db.cRMCase.count({ where: { tenantId: result.tenant.id } }), users: members.length, team: team.name, credentialsProvisioned: false, messagesSent: 0 }));
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("FAIL CRM_DEMO_BOOTSTRAP"); process.exitCode = 1; });
