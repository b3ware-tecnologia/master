import { describe, expect, it } from "vitest";
import { evaluateEligibility, policySchema, type GovernanceInput } from "@/services/messaging-governance";

const valid: GovernanceInput = { now: new Date("2026-10-05T15:00:00Z"), status: "APPROVED", approvedAt: new Date("2026-10-05T14:00:00Z"), scheduledAt: new Date("2026-10-05T14:30:00Z"), channel: "WHATSAPP", customerActive: true, recipientAvailable: true, consent: "OPTED_IN", lastOutboundAt: null, policy: { timeZone: "America/Sao_Paulo", startHour: 9, endHour: 18, minIntervalMinutes: 1440, enabledChannels: ["WHATSAPP"] } };
describe("messaging governance", () => {
  it("requires explicit consent, approval, recipient and tenant policy", () => {
    expect(evaluateEligibility(valid)).toEqual({ eligible: true, reasons: [] });
    expect(evaluateEligibility({ ...valid, status: "DRAFT", approvedAt: null, consent: undefined, recipientAvailable: false, policy: null })).toEqual({ eligible: false, reasons: ["PLAN_NOT_APPROVED", "RECIPIENT_MISSING", "CONSENT_REQUIRED", "POLICY_REQUIRED"] });
    expect(evaluateEligibility({ ...valid, consent: "OPTED_OUT" }).reasons).toContain("CUSTOMER_OPTED_OUT");
  });
  it("enforces local start-inclusive/end-exclusive hours, scheduling and cooldown", () => {
    expect(evaluateEligibility({ ...valid, now: new Date("2026-10-05T21:00:00Z") }).reasons).toContain("OUTSIDE_CONTACT_WINDOW");
    expect(evaluateEligibility({ ...valid, now: new Date("2026-10-05T12:00:00Z"), scheduledAt: new Date("2026-10-05T11:00:00Z") }).eligible).toBe(true);
    expect(evaluateEligibility({ ...valid, scheduledAt: new Date("2026-10-05T16:00:00Z") }).reasons).toContain("NOT_DUE");
    expect(evaluateEligibility({ ...valid, lastOutboundAt: new Date("2026-10-05T14:59:00Z") }).reasons).toContain("CONTACT_COOLDOWN");
  });
  it("blocks inactive customers and disabled channels; rejects invalid policies", () => {
    expect(evaluateEligibility({ ...valid, customerActive: false, channel: "EMAIL" }).reasons).toEqual(["CUSTOMER_INACTIVE", "CHANNEL_DISABLED"]);
    expect(policySchema.safeParse({ ...valid.policy, timeZone: "Invalid/Zone" }).success).toBe(false);
    expect(policySchema.safeParse({ ...valid.policy, startHour: 18, endHour: 9 }).success).toBe(false);
    expect(policySchema.safeParse({ ...valid.policy, enabledChannels: ["WHATSAPP", "WHATSAPP"] }).success).toBe(false);
  });
});
