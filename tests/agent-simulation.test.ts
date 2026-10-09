import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAgentSimulationInput, commercialAIJobInputSchema, vanessaTestScenarios } from "@/domain/agent-simulation";
import { validateConciergeDecision } from "@/integrations/credit-concierge";
import { syntheticPlaybook } from "../scripts/fixtures/commercial";

const request = { kind: "TEST_AGENT", entityId: "approved-test-strategy", requestKey: randomUUID() };
const decision = { intent: "GREETING", stage: "FIRST_CONTACT_SENT", response: "Oi, sou a Vanessa da BM Crédito. Você tem um tempinho para conversar?", summary: "Primeira abordagem sugerida.", handoff: false, handoffReason: null, followUpAt: null, followUpReason: null, evidenceIds: [], conditionId: null, productId: null };
describe("Vanessa simulation boundaries", () => {
  it("starts an initial approach without inventing an incoming message", () => {
    const parsed = commercialAIJobInputSchema.parse({ ...request, simulationStage: "INITIAL" });
    const input = buildAgentSimulationInput(parsed, syntheticPlaybook, []);
    expect(input.stage).toBe("INITIAL"); expect(input.messages).toEqual([]);
    expect(input.objective).toBe(syntheticPlaybook.objective);
    expect(validateConciergeDecision(decision, input)).toEqual(decision);
    expect(() => validateConciergeDecision({ ...decision, evidenceIds: ["sandbox-user"] }, input)).toThrow();
  });
  it("preserves reply semantics for previously queued tests", () => {
    const parsed = commercialAIJobInputSchema.parse({ ...request, message: "Agora não." });
    const input = buildAgentSimulationInput(parsed, syntheticPlaybook, []);
    expect(input.stage).toBe("REPLY"); expect(input.messages).toEqual([{ id: "sandbox-user", direction: "INBOUND", kind: "TEXT", text: "Agora não." }]);
  });
  it.each([
    { ...request, simulationStage: "INITIAL", message: "Hidden reply" },
    { ...request, simulationStage: "REPLY", message: "  " },
    { ...request, simulationStage: "COPILOT", message: "Oi" },
    { ...request, simulationStage: "INITIAL", customerId: "real-customer" },
    { ...request, kind: "COPILOT", simulationStage: "INITIAL" },
    { ...request, kind: "PLAYBOOK", simulationStage: "INITIAL" },
  ])("rejects mismatched stages and user-selected real customers", (value) => expect(commercialAIJobInputSchema.safeParse(value).success).toBe(false));
  it.each(vanessaTestScenarios)("prepares scenario $id without production identity", (scenario) => {
    const parsed = commercialAIJobInputSchema.parse({ ...request, simulationStage: scenario.stage, message: scenario.message });
    const input = buildAgentSimulationInput(parsed, syntheticPlaybook, []);
    expect(input.customer).toEqual({ firstName: "Maria", facts: [] });
    expect(input.knowledge).toEqual([]); expect(input.stage).toBe(scenario.stage);
  });
  it("does not let a proposed first approach introduce an arbitrary web link", () => {
    const input = buildAgentSimulationInput({ simulationStage: "INITIAL", message: "" }, syntheticPlaybook, []);
    expect(() => validateConciergeDecision({ ...decision, response: decision.response + " https://example.com/chat" }, input)).toThrow();
  });
});
