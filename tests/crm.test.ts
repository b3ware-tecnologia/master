import { describe, expect, it } from "vitest";
import { caseActionSchema, transitions, createCaseSchema, assignmentSchema } from "@/domain/crm";
import { roleCapabilities } from "@/domain/access";
import { randomUUID } from "node:crypto";
describe("CRM deterministic workflow", () => {
  it("requires a recorded result when moving or closing a case", () => {
    const action = { action: "transition", requestKey: randomUUID(), expectedVersion: 0, status: "COMPLETED" };
    expect(caseActionSchema.safeParse(action).success).toBe(false);
    expect(caseActionSchema.safeParse({ ...action, note: "Resultado registrado pelo atendente." }).success).toBe(true);
  });
  it("does not allow direct new-to-completed or reopening a terminal case", () => {
    expect(transitions.NEW).not.toContain("COMPLETED");
    expect(transitions.COMPLETED).toEqual([]); expect(transitions.CANCELLED).toEqual([]);
  });
  it("rejects unrecognized financial decision fields", () => {
    expect(createCaseSchema.safeParse({ requestKey: randomUUID(), customerId: "customer", title: "Solicitação", creditApproved: true }).success).toBe(false);
  });
  it("allows a team queue without assigning a consultant", () => {
    expect(assignmentSchema.safeParse({ teamId: "team", assignedMembershipId: null, expectedVersion: null }).success).toBe(true);
    expect(assignmentSchema.safeParse({ teamId: "team", assignedMembershipId: "member", expectedVersion: -1 }).success).toBe(false);
  });
  it("keeps consultants restricted to their customer and case work", () => {
    expect(roleCapabilities.CONSULTANT).toContain("crm.read"); expect(roleCapabilities.CONSULTANT).toContain("crm.update");
    for (const capability of ["crm.create", "distribution.manage", "users.read", "lists.import", "messaging.read"]) expect(roleCapabilities.CONSULTANT).not.toContain(capability);
  });
});
