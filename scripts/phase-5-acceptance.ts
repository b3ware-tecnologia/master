import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { roleCapabilities, type AuthorizationContext } from "@/domain/access";
import { AuthorizationError, ConflictError } from "@/domain/errors";
import { MessagingProviderUnavailable } from "@/domain/messaging-provider";
import { registerEvolutionConnection, getMessagingConnection, checkMessagingConnection, provisionEvolutionConnection, pairMessagingConnection, pairPlatformMessagingConnection } from "@/services/messaging-connection-service";
import { configuredEvolutionProvider } from "@/integrations/evolution-provider";
import { assertTestHooksAllowed } from "@/services/test-hooks";

async function main() {
  assertTestHooksAllowed(true);
  const schema = process.env.ACCEPTANCE_ISOLATED_SCHEMA;
  assert(schema && /^phase5_acceptance_[a-f0-9]{32}$/.test(schema));
  assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
  const suffix = randomUUID();
  const tenant = await db.tenant.create({ data: { name: "Synthetic Connector", slug: `connector-${suffix}` } });
  const foreign = await db.tenant.create({ data: { name: "Foreign Connector", slug: `foreign-${suffix}` } });
  const admin = await db.user.create({ data: { name: "Synthetic Platform", email: `platform-${suffix}@example.invalid`, status: "ACTIVE" } });
  await db.membership.create({ data: { tenantId: tenant.id, userId: admin.id, role: "PLATFORM_ADMIN", status: "ACTIVE" } });
  const master = await db.user.create({ data: { name: "Synthetic Master", email: `master-${suffix}@example.invalid`, status: "ACTIVE" } });
  const membership = await db.membership.create({ data: { tenantId: tenant.id, userId: master.id, role: "TENANT_MASTER", status: "ACTIVE" } });
  const context: AuthorizationContext = { tenantId: tenant.id, userId: master.id, membershipId: membership.id, role: "TENANT_MASTER", accessScope: "TENANT", capabilities: roleCapabilities.TENANT_MASTER };
  const input = { tenantId: tenant.id, instanceName: "synthetic_bm_connector" };
  await assert.rejects(registerEvolutionConnection(master.id, input), AuthorizationError);
  const connections = await Promise.all([registerEvolutionConnection(admin.id, input), registerEvolutionConnection(admin.id, input)]);
  assert.equal(connections[0].id, connections[1].id);
  assert.equal(await db.messagingConnection.count(), 1);
  assert.equal(await db.auditEvent.count({ where: { action: "MESSAGING_CONNECTION_REGISTERED" } }), 1);
  await assert.rejects(registerEvolutionConnection(admin.id, { tenantId: foreign.id, instanceName: input.instanceName }), ConflictError);
  await assert.rejects(getMessagingConnection({ ...context, tenantId: foreign.id }), AuthorizationError);
  const seen: string[] = [];
  const open = await checkMessagingConnection(context, { name: "ACCEPTANCE_STUB", getConnectionState: async (instance) => { seen.push(instance); return "OPEN"; } });
  assert.equal(open.lastState, "OPEN"); assert.equal(open.lastErrorCode, null); assert(open.lastCheckedAt);
  assert.deepEqual(seen, [input.instanceName]);
  const unavailable = await checkMessagingConnection(context, { name: "ACCEPTANCE_STUB", getConnectionState: async () => { throw new MessagingProviderUnavailable("NOT_CONFIGURED"); } });
  assert.equal(unavailable.lastState, "ERROR"); assert.equal(unavailable.lastErrorCode, "NOT_CONFIGURED");
  let remoteInstances = 0;
  const provisioned = new Set<string>();
  const pairingProvider = { name: "ACCEPTANCE_STUB", ensureInstance: async (name: string) => { if (!provisioned.has(name)) { provisioned.add(name); remoteInstances++; } }, getConnectionState: async () => "CLOSED" as const, requestPairing: async () => ({ state: "CONNECTING" as const, qrCode: "data:image/png;base64,iVBORw0KGgoAAA==" }) };
  await Promise.all([provisionEvolutionConnection(admin.id, input, pairingProvider), provisionEvolutionConnection(admin.id, input, pairingProvider)]);
  assert.equal(remoteInstances, 1);
  assert.equal(await db.auditEvent.count({ where: { action: "MESSAGING_INSTANCE_PREPARED" } }), 1);
  const paired = await pairMessagingConnection(context, pairingProvider);
  assert.equal(paired.connection.lastState, "CONNECTING"); assert(paired.qrCode);
  await pairPlatformMessagingConnection(admin.id, tenant.id, pairingProvider);
  const stored = JSON.stringify(await db.auditEvent.findMany({ where: { action: "MESSAGING_PAIRING_REQUESTED" } }));
  assert(!stored.includes(paired.qrCode)); assert(!stored.includes("base64"));
  await assert.rejects(pairMessagingConnection({ ...context, tenantId: foreign.id }, pairingProvider), AuthorizationError);
  await assert.rejects(pairMessagingConnection({ ...context, role: "CONSULTANT", capabilities: roleCapabilities.CONSULTANT }, pairingProvider), AuthorizationError);
  await assert.rejects(provisionEvolutionConnection(master.id, { tenantId: foreign.id, instanceName: "forbidden_creation" }, pairingProvider), AuthorizationError);
  await db.messagingConnection.updateMany({ where: { tenantId: tenant.id }, data: { enabled: false } });
  await assert.rejects(pairMessagingConnection(context, pairingProvider), ConflictError);
  await db.messagingConnection.updateMany({ where: { tenantId: tenant.id }, data: { enabled: true } });
  await db.membership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
  await assert.rejects(pairMessagingConnection(context, pairingProvider), AuthorizationError);
  await db.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });

  if (process.env.LIVE_EVOLUTION_ACCEPTANCE === "true") {
    const liveTenant = await db.tenant.create({ data: { name: "Synthetic Live Pairing", slug: `live-pairing-${suffix}` } });
    const liveName = `bm_acceptance_${suffix.replaceAll("-", "")}`;
    try {
      const prepared = await provisionEvolutionConnection(admin.id, { tenantId: liveTenant.id, instanceName: liveName });
      assert.equal(prepared.lastState, "CLOSED");
      await provisionEvolutionConnection(admin.id, { tenantId: liveTenant.id, instanceName: liveName });
      assert.equal(await db.messagingConnection.count({ where: { tenantId: liveTenant.id } }), 1);
      assert.equal(await configuredEvolutionProvider().getConnectionState(liveName), "CLOSED");
      let livePair = await pairPlatformMessagingConnection(admin.id, liveTenant.id);
      for (let attempt = 0; !livePair.qrCode && attempt < 4; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        livePair = await pairPlatformMessagingConnection(admin.id, liveTenant.id);
      }
      assert(livePair.qrCode?.startsWith("data:image/png;base64,iVBORw0KGgo"), "Live QR code not generated");
      assert.equal(livePair.connection.lastState, "CONNECTING");
      console.log("PASS LIVE_EVOLUTION_PROVISIONING_IDEMPOTENCY_AND_QR");
    } finally {
      // Only delete this run's synthetic, unpaired provider instance.
      const response = await fetch(`${process.env.EVOLUTION_API_URL}/instance/delete/${liveName}`, { method: "DELETE", headers: { apikey: process.env.EVOLUTION_API_KEY! }, signal: AbortSignal.timeout(15_000) });
      assert([200, 404].includes(response.status), "Synthetic provider cleanup failed");
      let remains = true;
      for (let attempt = 0; remains && attempt < 10; attempt++) {
        const list = await fetch(`${process.env.EVOLUTION_API_URL}/instance/fetchInstances`, { headers: { apikey: process.env.EVOLUTION_API_KEY! }, signal: AbortSignal.timeout(10_000) });
        assert.equal(list.status, 200);
        const instances: { name: string }[] = await list.json();
        remains = instances.some((instance) => instance.name === liveName);
        if (remains) await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      assert(!remains, "Synthetic instance remains");
      console.log("PASS SYNTHETIC_PROVIDER_INSTANCE_CLEANUP");
    }
  }
  await assert.rejects(checkMessagingConnection({ ...context, role: "CONSULTANT", capabilities: roleCapabilities.CONSULTANT }), AuthorizationError);
  await db.user.update({ where: { id: admin.id }, data: { status: "DISABLED" } });
  await assert.rejects(registerEvolutionConnection(admin.id, { tenantId: foreign.id, instanceName: "foreign_bm" }), AuthorizationError);
  await assert.rejects(pairPlatformMessagingConnection(admin.id, tenant.id, pairingProvider), AuthorizationError);
  console.log(`PHASE_5_CONNECTOR_PREPARATION_JSON=${JSON.stringify({ connectionId: open.id, concurrentRegistrations: 2, registrationAudits: 1, exclusiveInstanceBinding: true, masterProvisioningDenied: true, foreignReadEmpty: true, consultantDenied: true, disabledPlatformAdminDenied: true, missingConfigurationBlocked: true, serializedProvisioning: true, qrNotPersisted: true, suspendedMembershipPairingDenied: true, provider: process.env.LIVE_EVOLUTION_ACCEPTANCE === "true" ? "LIVE_EVOLUTION_AND_ACCEPTANCE_STUB" : "ACCEPTANCE_STUB", liveEvolutionTested: process.env.LIVE_EVOLUTION_ACCEPTANCE === "true", sentMessages: 0 })}`);
  await db.$disconnect();
}
void main().catch(async (error: unknown) => { console.error(error); await db.$disconnect(); process.exitCode = 1; });
