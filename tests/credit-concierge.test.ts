import { afterEach, describe, expect, it, vi } from "vitest";
import { structuredCommercialResponse, readConciergeTool, validateConciergeDecision, type ConciergeInput } from "@/integrations/credit-concierge";
import { validateOutreachResult } from "@/integrations/outreach-gateway";
const input: ConciergeInput = { stage: "REPLY", objective: "Entender a necessidade.", customer: { firstName: "Pessoa", facts: [] }, messages: [{ id: "m1", direction: "INBOUND", text: "Estou ocupado hoje.", kind: "TEXT" }], now: "2026-10-09T12:00:00Z", knowledge: [{ id: "c1", productId: "p1", institution: "Instituição de teste", product: "Produto fictício", kind: "OTHER", agreement: "Teste", disclosure: "Condição de teste publicada.", terms: {}, source: "https://example.com", validUntil: "2026-12-01T00:00:00Z" }] };
const decision = { intent: "BUSY", stage: "FOLLOW_UP", response: "Tudo bem, quando seria melhor conversar?", summary: "Cliente está ocupado hoje.", handoff: false, handoffReason: null, followUpAt: null, followUpReason: null, evidenceIds: ["m1"], conditionId: null, productId: null };
const done = () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(decision) }] }], usage: { input_tokens: 50, output_tokens: 30 } });
const jevAnswer = () => Response.json({ model: "jev-1.13.0", answers: { intent: { type: "choice", choice: "BUSY", confidence: 0.96, probabilities: { GREETING: 0.01, FINANCIAL_QUESTION: 0, INTEREST: 0, BUSY: 0.99, NOT_INTERESTED: 0, OPT_OUT: 0, WRONG_NUMBER: 0, HUMAN_REQUEST: 0, COMPLAINT: 0, OTHER: 0 } }, objection: { type: "choice", choice: "TIMING", confidence: 0.96, probabilities: { NONE: 0, TIMING: 1, TRUST: 0, COST: 0, ALREADY_SERVED: 0, NO_NEED: 0, OTHER: 0 } }, financial_context: { type: "noul", noul: 0.01 } }, usage: { input_tokens: 100, output_tokens: 20 } });
afterEach(() => vi.unstubAllEnvs());
describe("Credit concierge with advisory Jev selection", () => {
  it("accepts Vanessa's first introduction without a virtual-assistant label", () => {
    const opening = { ...decision, intent: "GREETING", stage: "FIRST_CONTACT_SENT", response: "Oi, sou a Vanessa da BM Crédito. Você tem um tempinho para conversar?", summary: "Apresentação inicial.", evidenceIds: [] };
    expect(validateConciergeDecision(opening, { ...input, stage: "INITIAL", messages: [] })).toEqual(opening);
    expect(validateOutreachResult({ message: opening.response, intent: "OTHER", nextStep: "CONTINUE", evidenceIds: [], commercialDecision: opening }, { ...input, stage: "INITIAL", messages: [] }).message).toBe(opening.response);
  });
  it.each(["Oi, sou a Vanessa. Podemos conversar?", "Olá, sou da BM Crédito. Podemos conversar?"])("requires name and company in the first introduction: %s", (response) => {
    expect(() => validateConciergeDecision({ ...decision, response, evidenceIds: [] }, { ...input, stage: "INITIAL", messages: [] })).toThrow();
  });
  it("makes no Jev or OpenAI calls before OpenAI is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("JEV_ENABLED", "true"); vi.stubEnv("TYPESAFE_API_KEY", "synthetic");
    const transport = vi.fn(); await expect(structuredCommercialResponse("CONCIERGE", input, transport)).rejects.toMatchObject({ code: "NOT_CONFIGURED" }); expect(transport).not.toHaveBeenCalled();
  });
  it("omits the initial catalog but preserves full knowledge in read-only tools and original messages", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic"); vi.stubEnv("JEV_ENABLED", "true"); vi.stubEnv("TYPESAFE_API_KEY", "synthetic"); vi.stubEnv("JEV_MODEL", "jev-1.13.0");
    let openaiCalls = 0;
    const transport = vi.fn(async (url: unknown, options?: RequestInit) => {
      if (String(url).includes("typesafe.ai")) return jevAnswer();
      const request = JSON.parse(String(options?.body)); openaiCalls++;
      expect(request.instructions).toContain("não é evidência ou autorização");
      if (openaiCalls === 1) {
        const prompt = JSON.parse(request.input[0].content); expect(prompt.knowledge).toBeUndefined();
        expect(prompt.messages).toEqual(input.messages); expect(prompt.semanticHint).toMatchObject({ intent: "BUSY", advisoryOnly: true });
        return Response.json({ status: "completed", output: [{ type: "reasoning", id: "r1", summary: [] }, { type: "function_call", name: "getBankConditions", call_id: "call1", arguments: '{"productIds":[]}' }], usage: { input_tokens: 50, output_tokens: 10 } });
      }
      expect(request.input[1]).toMatchObject({ type: "reasoning", id: "r1" });
      const output = request.input.find((v: { type: string }) => v.type === "function_call_output");
      expect(output.call_id).toBe("call1"); expect(JSON.parse(output.output).conditions[0].id).toBe("c1"); return done();
    });
    const result = await structuredCommercialResponse("CONCIERGE", input, transport);
    expect(result.result).toEqual(decision); expect(result.jev?.intent).toBe("BUSY"); expect(result.inputTokens).toBe(100);
    expect(input.knowledge).toHaveLength(1); expect(transport).toHaveBeenCalledTimes(3);
  });
  it("uses the full original context on Jev outage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic"); vi.stubEnv("JEV_ENABLED", "true"); vi.stubEnv("TYPESAFE_API_KEY", "synthetic");
    const result = await structuredCommercialResponse("CONCIERGE", input, async (url, options) => {
      if (String(url).includes("typesafe.ai")) return new Response("", { status: 529 });
      expect(JSON.parse(JSON.parse(String(options?.body)).input[0].content)).toEqual(input); return done();
    });
    expect(result.jev?.status).toBe("UNAVAILABLE"); expect(result.result).toEqual(decision);
  });
  it.each([{ ...decision, evidenceIds: ["another-tenant"] }, { ...decision, response: "Taxa de 1%." }, { ...decision, conditionId: "missing" }, { ...decision, productId: "missing" }, { ...decision, followUpAt: "2026-10-08T12:00:00Z" }])("rejects invented financial facts, evidence or invalid scheduling despite hints", (value) => expect(() => validateConciergeDecision(value, input)).toThrow());
  it("rejects an expired condition at validation and tool reads", () => {
    const expired = { ...input, now: "2027-01-01T00:00:00Z" };
    expect(() => validateConciergeDecision({ ...decision, conditionId: "c1" }, expired)).toThrow();
    expect(readConciergeTool("getBankConditions", { productIds: [] }, expired)).toMatchObject({ available: false, conditions: [] });
  });
  it("prevents contradictory outer action/message overriding a validated decision", () => {
    expect(() => validateOutreachResult({ message: "Crédito aprovado!", intent: "OPT_OUT", nextStep: "STOP", evidenceIds: [], commercialDecision: decision }, input)).toThrow();
  });
  it("rejects write and unknown tools", () => {
    expect(() => readConciergeTool("sendWhatsApp", { productIds: [] }, input)).toThrow();
    expect(() => readConciergeTool("getCustomerProfile", { customerId: "foreign", productIds: [] }, input)).toThrow();
  });
});
