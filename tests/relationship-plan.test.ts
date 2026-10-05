import { describe, expect, it } from "vitest";
import { createPlanSchema, planActionSchema } from "@/services/relationship-plan-service";
import { roleCapabilities } from "@/domain/access";

describe("relationship planning API contract", () => {
  it("rejects client-selected tenant, approval and status fields", () => {
    const valid = { customerId: "customer", requestKey: "a4b1514d-6c3c-4d7a-831d-7a6e6c0588cc", purpose: "Agendar revisão", message: "Olá", channel: "WHATSAPP", scheduledAt: "2026-10-06T14:00:00-03:00" };
    expect(createPlanSchema.safeParse(valid).success).toBe(true);
    for (const field of ["tenantId", "approvedById", "status"]) expect(createPlanSchema.safeParse({ ...valid, [field]: "injected" }).success).toBe(false);
    expect(planActionSchema.safeParse({ action: "send" }).success).toBe(false);
  });
  it("keeps approval restricted to tenant masters until team scope exists", () => {
    expect(roleCapabilities.TENANT_MASTER).toContain("plans.approve");
    expect(roleCapabilities.TENANT_MANAGER).not.toContain("plans.approve");
    expect(roleCapabilities.CONSULTANT).not.toContain("plans.manage");
    expect(roleCapabilities.PLATFORM_ADMIN).not.toContain("plans.read");
  });
});
