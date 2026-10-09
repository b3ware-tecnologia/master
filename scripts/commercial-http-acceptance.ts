import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword } from "@/lib/auth/crypto";
import { syntheticPlaybook } from "./fixtures/commercial";

async function main() {
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging");
  assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a");
  assert.equal(process.env.LIVE_HTTP_ACCEPTANCE, "true");
  assert(!process.env.OPENAI_API_KEY?.trim());
  assert.notEqual(process.env.WHATSAPP_OUTBOUND_ENABLED, "true");
  const fixture = JSON.parse(await readFile("/tmp/bm-commercial-visual.json", "utf8"));
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId } });
  assert.equal(tenant.slug, "demonstracao-crm-staging");
  async function request(path: string, cookie = "", method = "GET", body?: unknown, tenantId = tenant.id) {
    return fetch(new URL(path, process.env.APP_URL), { method, redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { cookie, "x-tenant-id": tenantId, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function login(email: string, password: string) {
    const response = await request("/api/auth/login", "", "POST", { email, password });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  }
  const password = createOpaqueToken();
  const viewer = await db.user.create({ data: { name: "HTTP test viewer", email: `${randomUUID()}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } });
  await db.membership.create({ data: { tenantId: tenant.id, userId: viewer.id, role: "VIEWER", status: "ACTIVE" } });
  let playbookId: string | undefined;
  try {
    const cookie = await login(fixture.email, fixture.password);
    const viewerCookie = await login(viewer.email, password);
    assert.equal((await request("/api/commercial")).status, 401);
    assert.equal((await request("/api/commercial", cookie, "GET", undefined, randomUUID())).status, 403);
    assert.equal((await request("/api/platform/commercial", cookie)).status, 403);
    const state = await request("/api/commercial", cookie); assert.equal(state.status, 200); assert(state.headers.get("cache-control")?.includes("no-store"));
    assert.equal((await state.json()).configuration.configured, false);
    const readOnly = await request("/api/commercial", viewerCookie); assert.equal(readOnly.status, 200); assert.equal((await readOnly.json()).canUpdate, false);
    const create = { operation: "playbook-create", input: { name: "HTTP acceptance temporary", instruction: "Estratégia fictícia para validar acesso e aprovação, sem envios." } };
    assert.equal((await request("/api/commercial", viewerCookie, "POST", create)).status, 403);
    const created = await request("/api/commercial", cookie, "POST", create); assert.equal(created.status, 200); const playbook = await created.json(); playbookId = playbook.id;
    const edit = await request("/api/commercial", cookie, "POST", { operation: "playbook-update", id: playbook.id, input: { action: "edit", expectedVersion: 0, instruction: create.input.instruction, interpretation: syntheticPlaybook } }); assert.equal(edit.status, 200);
    assert.equal((await request("/api/commercial", cookie, "POST", { operation: "playbook-update", id: playbook.id, input: { action: "approve", expectedVersion: 1, confirmed: true } })).status, 200);
    const job = { operation: "ai-job", input: { kind: "TEST_AGENT", entityId: playbook.id, requestKey: randomUUID(), simulationStage: "INITIAL", message: "" } };
    const queued = await request("/api/commercial", cookie, "POST", job); assert.equal(queued.status, 200); const initial = await queued.json(); assert.equal(initial.status, "WAITING_CONFIGURATION");
    assert.equal((await (await request("/api/commercial", cookie, "POST", job)).json()).id, initial.id);
    assert.equal((await request("/api/commercial", cookie, "POST", { ...job, input: { ...job.input, simulationStage: "REPLY", message: "Outra entrada" } })).status, 409);
    assert.equal((await request("/api/commercial", cookie, "POST", { ...job, input: { ...job.input, requestKey: randomUUID(), message: "Entrada indevida" } })).status, 400);
    for (const route of ["/app", "/app/commercial", "/app/crm", "/app/conversations", "/app/ai-outreach", "/app/settings", "/app/users", "/app/teams"]) assert.equal((await request(route, cookie)).status, 200, route);
    const expired = await request("/platform"); assert([303,307,308].includes(expired.status)); assert(expired.headers.get("location")?.endsWith("/login"));
    await db.membership.updateMany({ where: { userId: viewer.id }, data: { status: "SUSPENDED" } });
    assert.equal((await request("/api/commercial", viewerCookie)).status, 403);
    console.log(JSON.stringify({ result: "PASS", deployedHttp: true, authenticationTenantRoleRevocation: true, playbookApproval: true, initialSimulationDeferred: true, idempotency: true, routes: 8, expiredSessionRedirect: true, openAICalls: 0, messagesSent: 0 }));
  } finally {
    if (playbookId) {
      await db.commercialAIJob.deleteMany({ where: { tenantId: tenant.id, entityId: playbookId, requestedById: fixture.userId } });
      await db.campaignPlaybook.deleteMany({ where: { id: playbookId, tenantId: tenant.id, createdById: fixture.userId } });
    }
    await db.session.deleteMany({ where: { userId: viewer.id } });
    await db.membership.deleteMany({ where: { userId: viewer.id, tenantId: tenant.id } });
    await db.user.delete({ where: { id: viewer.id } });
  }
}
void main().catch((error) => { console.error(error instanceof assert.AssertionError ? error.message : "COMMERCIAL_HTTP_FAILED"); process.exitCode = 1; }).finally(() => db.$disconnect());
