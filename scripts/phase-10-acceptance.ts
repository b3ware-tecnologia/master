import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { roleCapabilities, roleAccessScope, type AuthorizationContext } from "@/domain/access";
import { outboundPreview, requestOutbound, processOutboundBatch, cancelOutbound, reconcileOutbound, outboundDetail } from "@/services/outbound-service";
import { changePlan } from "@/services/relationship-plan-service";
import { saveCommunicationPreference, saveMessagingPolicy } from "@/services/messaging-governance";
import { MessagingProviderUnavailable } from "@/domain/messaging-provider";

async function main() {
  const schema = process.env.ACCEPTANCE_ISOLATED_SCHEMA;
  assert(schema && /^phase10_acceptance_[a-f0-9]{32}$/.test(schema)); assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
  const tenant = await db.tenant.create({ data: { name: "Synthetic outbound", slug: randomUUID() } });
  const foreign = await db.tenant.create({ data: { name: "Foreign outbound", slug: randomUUID() } });
  const user = await db.user.create({ data: { name: "Synthetic sender", email: `${randomUUID()}@example.invalid`, status: "ACTIVE" } });
  const membership = await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "TENANT_MASTER", status: "ACTIVE" } });
  const context: AuthorizationContext = { tenantId: tenant.id, userId: user.id, membershipId: membership.id, role: "TENANT_MASTER", capabilities: roleCapabilities.TENANT_MASTER, accessScope: roleAccessScope.TENANT_MASTER };
  const actor = { tenantId: tenant.id, context };
  const connection = await db.messagingConnection.create({ data: { tenantId: tenant.id, instanceName: `synthetic_${randomUUID().replaceAll("-", "")}` } });
  const policy = { timeZone: "UTC", startHour: 0, endHour: 24, minIntervalMinutes: 60, enabledChannels: ["WHATSAPP" as const] };
  await saveMessagingPolicy(actor, policy);
  let calls = 0; let failure = false; let open = true;
  const runtime = { enabled: () => true, configured: () => true, provider: () => ({ name: "EVOLUTION" as const, getConnectionState: async () => open ? "OPEN" as const : "CLOSED" as const, sendText: async (_instance: string, recipient: string, _text: string) => { void _instance; void _text; calls++; if (failure) throw new MessagingProviderUnavailable("UNREACHABLE"); await new Promise((resolve) => setTimeout(resolve, 10)); return { providerMessageId: `synthetic-${calls}`, remoteJid: `${recipient}@s.whatsapp.net` }; } }) };
  let sequence = 0;
  async function fixture() {
    const customer = await db.customer.create({ data: { tenantId: tenant.id, fullName: "Private synthetic client", displayName: "Private synthetic client" } });
    const phone = await db.customerIdentifier.create({ data: { tenantId: tenant.id, customerId: customer.id, type: "PHONE", normalizedValue: `1555555${String(++sequence).padStart(4, "0")}`, verification: "CONFIRMED" } });
    await saveCommunicationPreference(actor, customer.id, { channel: "WHATSAPP", consent: "OPTED_IN", evidence: "Synthetic isolated consent evidence" });
    const plan = await db.relationshipPlan.create({ data: { tenantId: tenant.id, customerId: customer.id, createdById: user.id, approvedById: user.id, approvedAt: new Date(), status: "APPROVED", purpose: "Synthetic purpose", message: "Private synthetic outbound text", requestKey: randomUUID(), channel: "WHATSAPP", scheduledAt: new Date(Date.now() - 1000) } });
    return { customer, phone, plan };
  }
  async function review(value: Awaited<ReturnType<typeof fixture>>) {
    const preview = await outboundPreview(actor, value.plan.id, value.phone.id, runtime); assert.equal(preview.eligible, true, preview.reasons.join(","));
    return { requestKey: randomUUID(), planId: value.plan.id, recipientIdentifierId: value.phone.id, snapshotHash: preview.snapshotHash, confirmed: true as const };
  }
  const value = await fixture(); const input = await review(value);
  const duplicate = await Promise.all([requestOutbound(actor, input, runtime), requestOutbound(actor, input, runtime)]); assert.equal(duplicate[0].id, duplicate[1].id);
  await assert.rejects(requestOutbound(actor, { ...input, confirmed: false } as never, runtime));
  await assert.rejects(requestOutbound(actor, { ...input, snapshotHash: "b".repeat(64) }, runtime), /outros dados/);
  await assert.rejects(requestOutbound(actor, { ...input, requestKey: randomUUID() }, runtime), /já possui/);
  await assert.rejects(outboundPreview({ ...actor, tenantId: foreign.id }, value.plan.id, value.phone.id, runtime));
  await assert.rejects(db.outboundDispatch.update({ where: { id: duplicate[0].id }, data: { tenantId: foreign.id } }));
  await assert.rejects(cancelOutbound(actor, duplicate[0].id, 999));
  await Promise.all([processOutboundBatch(runtime), processOutboundBatch(runtime)]); assert.equal(calls, 1);
  assert.equal((await db.outboundDispatch.findUniqueOrThrow({ where: { id: duplicate[0].id } })).status, "ACCEPTED");
  assert.equal((await db.customer.findUniqueOrThrow({ where: { id: value.customer.id } })).lastOutboundAt, null);
  await assert.rejects(cancelOutbound(actor, duplicate[0].id, 2)); await assert.rejects(changePlan(actor, value.plan.id, "cancel"));
  const another = await db.relationshipPlan.create({ data: { tenantId: tenant.id, customerId: value.customer.id, createdById: user.id, approvedById: user.id, approvedAt: new Date(), status: "APPROVED", purpose: "Another plan", message: "Another text", requestKey: randomUUID(), channel: "WHATSAPP", scheduledAt: new Date(Date.now() - 1000) } });
  assert((await outboundPreview(actor, another.id, value.phone.id, runtime)).reasons.includes("CONTACT_COOLDOWN"));
  console.log("PASS concurrent request/worker deduplication, tenant FKs, accepted reservation and observed-contact separation");

  const cancelled = await fixture(); const cancelledInput = await review(cancelled); const cancellation = await requestOutbound(actor, cancelledInput, runtime);
  await cancelOutbound(actor, cancellation.id, 0); await processOutboundBatch(runtime); assert.equal(calls, 1);
  const changed = await fixture(); const changedInput = await review(changed); await db.customerIdentifier.update({ where: { id: changed.phone.id }, data: { verification: "REJECTED" } });
  await assert.rejects(requestOutbound(actor, changedInput, runtime), /mudaram/);
  for (const mutation of ["consent", "policy", "customer", "phone", "binding", "plan", "role", "user", "membership", "offline", "disabled"]) {
    const item = await fixture(); const queued = await requestOutbound(actor, await review(item), runtime); const before: number = calls;
    if (mutation === "consent") await saveCommunicationPreference(actor, item.customer.id, { channel: "WHATSAPP", consent: "OPTED_OUT", evidence: "Synthetic withdrawn consent" });
    if (mutation === "policy") await saveMessagingPolicy(actor, { ...policy, enabledChannels: [] });
    if (mutation === "customer") await db.customer.update({ where: { id: item.customer.id }, data: { status: "BLOCKED" } });
    if (mutation === "phone") await db.customerIdentifier.update({ where: { id: item.phone.id }, data: { verification: "REJECTED" } });
    if (mutation === "binding") await db.messagingConnection.update({ where: { id: connection.id }, data: { enabled: false } });
    if (mutation === "plan") await changePlan(actor, item.plan.id, "cancel");
    if (mutation === "role") await db.membership.update({ where: { id: membership.id }, data: { role: "CONSULTANT" } });
    if (mutation === "user") await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    if (mutation === "membership") await db.membership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
    if (mutation === "offline") open = false;
    await processOutboundBatch(mutation === "disabled" ? { ...runtime, enabled: () => false } : runtime);
    assert.equal(calls, before, mutation); assert.equal((await db.outboundDispatch.findUniqueOrThrow({ where: { id: queued.id } })).status, "BLOCKED", mutation);
    await db.membership.update({ where: { id: membership.id }, data: { role: "TENANT_MASTER", status: "ACTIVE" } }); await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
    await db.messagingConnection.update({ where: { id: connection.id }, data: { enabled: true } }); await saveMessagingPolicy(actor, policy); open = true;
  }
  console.log("PASS cancellation, stale review, eleven pre-send revocation/offline/disabled guards");
  const uncertain = await fixture(); const attempt = await requestOutbound(actor, await review(uncertain), runtime); failure = true;
  await processOutboundBatch(runtime); const afterFailure = calls; failure = false; await processOutboundBatch(runtime); assert.equal(calls, afterFailure);
  let stored = await db.outboundDispatch.findUniqueOrThrow({ where: { id: attempt.id } }); assert.equal(stored.status, "UNCERTAIN");
  await assert.rejects(cancelOutbound(actor, attempt.id, stored.version)); await assert.rejects(changePlan(actor, uncertain.plan.id, "cancel"));
  assert((await outboundPreview(actor, uncertain.plan.id, uncertain.phone.id, runtime)).reasons.includes("OTHER_ATTEMPT_UNCONFIRMED"));
  const conversation = await db.conversation.create({ data: { tenantId: tenant.id, connectionId: connection.id, remoteJid: `${uncertain.phone.normalizedValue}@s.whatsapp.net`, lastMessageAt: new Date() } });
  const wrong = await db.conversationMessage.create({ data: { tenantId: tenant.id, connectionId: connection.id, conversationId: conversation.id, providerMessageId: "wrong-observation", direction: "OUTBOUND", kind: "TEXT", text: "Wrong text", occurredAt: new Date() } });
  await assert.rejects(reconcileOutbound(actor, attempt.id, stored.version, wrong.id));
  const observed = await db.conversationMessage.create({ data: { tenantId: tenant.id, connectionId: connection.id, conversationId: conversation.id, providerMessageId: "observed-uncertain", direction: "OUTBOUND", kind: "TEXT", text: uncertain.plan.message, occurredAt: new Date() } });
  assert.equal((await outboundDetail(actor, attempt.id)).candidates.length, 1);
  await assert.rejects(reconcileOutbound(actor, attempt.id, 999, observed.id));
  await reconcileOutbound(actor, attempt.id, stored.version, observed.id); assert.equal(calls, afterFailure); stored = await db.outboundDispatch.findUniqueOrThrow({ where: { id: attempt.id } }); assert.equal(stored.status, "ACCEPTED");
  const stale = await fixture(); const staleJob = await requestOutbound(actor, await review(stale), runtime);
  await db.outboundDispatch.update({ where: { id: staleJob.id }, data: { status: "SENDING", claimToken: randomUUID(), startedAt: new Date(Date.now() - 180_000) } });
  await processOutboundBatch(runtime); assert.equal(calls, afterFailure); assert.equal((await db.outboundDispatch.findUniqueOrThrow({ where: { id: staleJob.id } })).status, "UNCERTAIN");
  console.log("PASS uncertain outcome and crash never retry; explicit observed-message reconciliation");
  for (const records of [await db.auditEvent.findMany({ where: { tenantId: tenant.id } }), await db.outboxEvent.findMany({ where: { tenantId: tenant.id } })]) { const text = JSON.stringify(records); assert(!text.includes("Private synthetic") && !text.includes(uncertain.phone.normalizedValue)); }
  console.log(JSON.stringify({ result: "PASS", phase: 10, isolatedPostgres: true, simulatedSends: calls, realProviderCalls: 0, actualMessagesSent: 0 }));
}
main().finally(() => db.$disconnect()).catch(() => { console.error("FAIL PHASE10_ACCEPTANCE"); process.exitCode = 1; });
