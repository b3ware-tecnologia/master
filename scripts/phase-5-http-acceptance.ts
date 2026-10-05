import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createOpaqueToken, hashPassword, hashToken } from "@/lib/auth/crypto";
import { assertTestHooksAllowed } from "@/services/test-hooks";

// Explicit, short-lived fixtures on the deployed staging APIs. No real messages.
assertTestHooksAllowed(true);
assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME, "staging");
assert.equal(process.env.RAILWAY_PROJECT_ID, "ef26eb2e-9425-471c-a647-65d93c0b1b8a");
assert.equal(process.env.LIVE_HTTP_ACCEPTANCE, "true");
const suffix = randomUUID().replaceAll("-", "");
const instanceName = `bm_http_acceptance_${suffix}`;
const tenantIds: string[] = [];
const userIds: string[] = [];
const baseUrl = process.env.APP_URL!;
const password = createOpaqueToken();
let providerTouched = false;

async function request(path: string, cookie = "", body?: object, tenantId?: string, method = "POST") {
  return fetch(`${baseUrl}${path}`, {
    method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(45_000),
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(tenantId ? { "x-tenant-id": tenantId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function fixtureUser(tenantId: string, role: "PLATFORM_ADMIN" | "TENANT_MASTER" | "CONSULTANT") {
  const user = await db.user.create({ data: { name: "Synthetic HTTP Acceptance", email: `${role.toLowerCase()}-${userIds.length}-${suffix}@example.invalid`, status: "ACTIVE", passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  await db.membership.create({ data: { userId: user.id, tenantId, role, status: "ACTIVE" } });
  const login = await request("/api/auth/login", "", { email: user.email, password });
  assert.equal(login.status, 200, "Fixture login failed");
  const result = await login.json();
  assert.equal(result.redirectTo, role === "PLATFORM_ADMIN" ? "/platform" : "/app");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "Session cookie missing");
  return { user, cookie };
}

async function main() {
try {
  const tenant = await db.tenant.create({ data: { name: "Synthetic HTTP Pairing", slug: `http-pairing-${suffix}` } });
  tenantIds.push(tenant.id);
  const foreign = await db.tenant.create({ data: { name: "Synthetic Foreign HTTP Pairing", slug: `http-pairing-foreign-${suffix}` } });
  tenantIds.push(foreign.id);
  const admin = await fixtureUser(tenant.id, "PLATFORM_ADMIN");
  const master = await fixtureUser(tenant.id, "TENANT_MASTER");
  const consultant = await fixtureUser(tenant.id, "CONSULTANT");
  const foreignMaster = await fixtureUser(foreign.id, "TENANT_MASTER");

  assert.equal((await request("/api/messaging-connection/pair")).status, 401);
  assert.equal((await request("/api/messaging-connection/pair", consultant.cookie)).status, 403);
  assert.equal((await request("/api/messaging-connection/pair", foreignMaster.cookie, undefined, tenant.id)).status, 403);
  assert.equal((await request("/api/platform/messaging-connections", master.cookie, { tenantId: tenant.id, instanceName })).status, 403);
  providerTouched = true;
  const prepared = await Promise.all([
    request("/api/platform/messaging-connections", admin.cookie, { tenantId: tenant.id, instanceName }),
    request("/api/platform/messaging-connections", admin.cookie, { tenantId: tenant.id, instanceName }),
  ]);
  for (const response of prepared) assert.equal(response.status, 201, "Live provisioning endpoint failed");
  const bindings = await Promise.all(prepared.map((response) => response.json()));
  assert.equal(bindings[0].id, bindings[1].id, "Concurrent provisioning duplicated binding");
  assert.equal(bindings[0].lastState, "CLOSED");
  assert.equal((await request("/api/messaging-connection/pair", foreignMaster.cookie)).status, 404);

  const platformPage = await request("/platform", admin.cookie, undefined, undefined, "GET");
  assert.equal(platformPage.status, 200);
  const platformHtml = await platformPage.text();
  assert(platformHtml.includes("Gerar QR Code"));
  assert(!platformHtml.includes(process.env.EVOLUTION_API_KEY!), "Provider key exposed in page");
  assert.equal((await request("/app/settings", master.cookie, undefined, undefined, "GET")).status, 200);

  let qrImage: string | null = null;
  for (let attempt = 0; !qrImage && attempt < 5; attempt++) {
    const pair = await request("/api/messaging-connection/pair", master.cookie);
    assert.equal(pair.status, 200, "Live tenant pairing endpoint failed");
    assert(pair.headers.get("cache-control")?.includes("no-store"), "QR response must not be cached");
    const value = await pair.json();
    assert.deepEqual(Object.keys(value).sort(), ["connection", "qrCode"]);
    qrImage = value.qrCode;
    if (!qrImage) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  assert(typeof qrImage === "string" && qrImage.startsWith("data:image/png;base64,iVBORw0KGgo"), "Live API QR missing");
  const platformPair = await request(`/api/platform/messaging-connections/${tenant.id}/pair`, admin.cookie);
  assert.equal(platformPair.status, 200);
  await platformPair.arrayBuffer();
  const audit = JSON.stringify(await db.auditEvent.findMany({ where: { tenantId: tenant.id, action: "MESSAGING_PAIRING_REQUESTED" } }));
  assert(!audit.includes(qrImage), "QR persisted to audit");
  assert(!audit.includes(process.env.EVOLUTION_API_KEY!), "Provider key persisted to audit");

  const inviteUser = await db.user.create({ data: { name: "Synthetic Invitation", email: `invite-${suffix}@example.invalid`, status: "INVITED" } });
  userIds.push(inviteUser.id);
  await db.membership.create({ data: { userId: inviteUser.id, tenantId: tenant.id, role: "CONSULTANT", status: "INVITED" } });
  const inviteToken = createOpaqueToken();
  await db.inviteToken.create({ data: { userId: inviteUser.id, tenantId: tenant.id, tokenHash: hashToken(inviteToken), expiresAt: new Date(Date.now() + 60_000) } });
  assert.equal((await request("/activate", "", undefined, undefined, "GET")).status, 200);
  const activation = await Promise.all([request("/api/auth/activate", "", { token: inviteToken, password }), request("/api/auth/activate", "", { token: inviteToken, password })]);
  assert.equal(activation.filter((response) => response.status === 200).length, 1, "Invitation redeemed more than once");
  assert(activation.every((response) => [200, 400, 409].includes(response.status)), "Unexpected activation status");
  console.log(JSON.stringify({ result: "PASS", deployedAuthenticatedHttp: true, concurrentProvisioning: true, qrGenerated: true, missingSession401: true, consultant403: true, foreignTenant403: true, masterProvisioning403: true, noBinding404: true, platformLoginRedirect: true, invitationSingleUse: true, qrNotPersisted: true, messagesSent: 0 }));
} finally {
  try {
    if (providerTouched) {
      const cleanup = await fetch(`${process.env.EVOLUTION_API_URL}/instance/delete/${instanceName}`, { method: "DELETE", headers: { apikey: process.env.EVOLUTION_API_KEY! }, signal: AbortSignal.timeout(15_000) });
      assert([200, 404].includes(cleanup.status), "Synthetic provider cleanup failed");
      let remains = true;
      for (let attempt = 0; remains && attempt < 10; attempt++) {
        const list = await fetch(`${process.env.EVOLUTION_API_URL}/instance/fetchInstances`, { headers: { apikey: process.env.EVOLUTION_API_KEY! }, signal: AbortSignal.timeout(10_000) });
        assert.equal(list.status, 200);
        const instances: { name: string }[] = await list.json();
        remains = instances.some((instance) => instance.name === instanceName);
        if (remains) await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      assert(!remains, "Synthetic provider instance remains");
    }
  } finally {
    // Exact IDs were created by this process, not supplied by a user or env variable.
    await db.$transaction(async (transaction) => {
      assert.equal(await transaction.tenant.count({ where: { id: { in: tenantIds }, slug: { endsWith: suffix } } }), tenantIds.length);
      await transaction.messagingConnection.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.auditEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.outboxEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await transaction.inviteToken.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.session.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.membership.deleteMany({ where: { userId: { in: userIds } } });
      await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      await transaction.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    });
    await db.$disconnect();
    console.log("PASS HTTP_FIXTURE_CLEANUP");
  }
}
}
void main().catch((error: unknown) => {
  console.error(JSON.stringify({ result: "FAIL", reason: error instanceof assert.AssertionError ? error.message : "Deployed HTTP acceptance failed" }));
  process.exitCode = 1;
});
