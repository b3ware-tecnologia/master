import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyWithJev, jevConfiguration } from "@/integrations/jev";
const intents = ["GREETING", "FINANCIAL_QUESTION", "INTEREST", "BUSY", "NOT_INTERESTED", "OPT_OUT", "WRONG_NUMBER", "HUMAN_REQUEST", "COMPLAINT", "OTHER"];
const objections = ["NONE", "TIMING", "TRUST", "COST", "ALREADY_SERVED", "NO_NEED", "OTHER"];
const messages = [{ direction: "INBOUND", text: "Pode falar comigo amanhã?", kind: "TEXT" }];
const choice = (keys: string[], selected: string, probability = 0.99, confidence = 0.96) => ({
  type: "choice", choice: selected, confidence,
  probabilities: Object.fromEntries(keys.map((key) => [key, key === selected ? probability : (1 - probability) / (keys.length - 1)])),
});
const body = (intent = "BUSY", probability = 0.99, confidence = 0.96, financial = 0.01) => ({
  model: "jev-1.13.0", answers: { intent: choice(intents, intent, probability, confidence), objection: choice(objections, "TIMING"), financial_context: { type: "noul", noul: financial } }, usage: { input_tokens: 220, output_tokens: 45 },
});
beforeEach(() => { vi.stubEnv("JEV_ENABLED", "true"); vi.stubEnv("TYPESAFE_API_KEY", "synthetic"); vi.stubEnv("JEV_MODEL", "jev-1.13.0"); });
afterEach(() => vi.unstubAllEnvs());
describe("Jev semantic triage contract", () => {
  it.each([["false", "synthetic", "DISABLED"], ["true", "", "NOT_CONFIGURED"]])("does not call the provider without both configuration and opt-in", async (enabled, key, status) => {
    vi.stubEnv("JEV_ENABLED", enabled); vi.stubEnv("TYPESAFE_API_KEY", key);
    const transport = vi.fn(); expect((await classifyWithJev(messages, transport)).status).toBe(status); expect(transport).not.toHaveBeenCalled();
  });
  it("uses the official typed endpoint and never includes customer or tenant identifiers", async () => {
    const transport = vi.fn(async (url: unknown, options?: RequestInit) => {
      expect(url).toBe("https://api.typesafe.ai/v1/systemone");
      const request = JSON.parse(String(options?.body));
      expect(request.model).toBe("jev-1.13.0"); expect(request.questions.intent.type).toBe("choice");
      expect(request.questions.objection.type).toBe("choice"); expect(request.questions.financial_context.type).toBe("noul");
      expect(request.state).toEqual({ messages: messages.map(({ direction, text }) => ({ direction, text })) }); return Response.json(body());
    });
    const result = await classifyWithJev(messages, transport);
    expect(result).toMatchObject({ status: "CLASSIFIED", intent: "BUSY", objection: "TIMING", omitInitialCatalog: true, inputTokens: 220, outputTokens: 45 });
    expect(JSON.stringify(result)).not.toContain(messages[0].text);
  });
  it.each(["GREETING", "BUSY", "NOT_INTERESTED", "OPT_OUT", "WRONG_NUMBER", "HUMAN_REQUEST"])("only proposes a lighter initial catalog for confidently nonfinancial %s", async (intent) => {
    expect((await classifyWithJev(messages, async () => Response.json(body(intent)))).omitInitialCatalog).toBe(true);
  });
  it.each(["FINANCIAL_QUESTION", "INTEREST", "COMPLAINT", "OTHER"])("keeps financial context for %s", async (intent) => {
    expect((await classifyWithJev(messages, async () => Response.json(body(intent)))).omitInitialCatalog).toBe(false);
  });
  it.each([[0.99, 0.50], [0.50, 0.99]])("requires both probability and confidence", async (probability, confidence) => {
    const result = await classifyWithJev(messages, async () => Response.json(body("BUSY", probability, confidence)));
    expect(result).toMatchObject({ status: "LOW_CONFIDENCE", intent: null, omitInitialCatalog: false });
  });
  it("keeps the initial catalog when financial relevance is uncertain", async () => {
    expect((await classifyWithJev(messages, async () => Response.json(body("BUSY", 0.99, 0.99, 0.5)))).omitInitialCatalog).toBe(false);
  });
  it.each([401, 422, 429, 529, 500])("falls back with no provider body exposure on HTTP %s", async (status) => {
    const result = await classifyWithJev(messages, async () => new Response("private provider error", { status }));
    expect(result).toMatchObject({ status: "UNAVAILABLE", intent: null, omitInitialCatalog: false });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("falls back on network/timeout errors", async () => {
    expect((await classifyWithJev(messages, async () => { throw new Error("private credential"); })).status).toBe("UNAVAILABLE");
  });
  it.each(["malformed", "probabilities", "choice", "model", "usage", "unknown"])("rejects malformed, incompatible or fabricated outputs (%s)", async (variant) => {
    const response = body();
    if (variant === "probabilities") response.answers.intent.probabilities.BUSY = 0.1;
    if (variant === "choice") response.answers.intent.choice = "CREDIT_APPROVED";
    if (variant === "model") response.model = "jev-9.0.0";
    if (variant === "usage") response.usage.input_tokens = -1;
    if (variant === "unknown") Object.assign(response.answers, { approve: true });
    const result = await classifyWithJev(messages, async () => variant === "malformed" ? new Response("{") : Response.json(response));
    expect(result.status).toBe("UNAVAILABLE"); expect(result.omitInitialCatalog).toBe(false);
  });
  it("bounds history and redacts email, CPF, phone, links and credentials", async () => {
    const privateText = "CPF 123.456.789-01 WhatsApp +55 (11) 99999-9999 teste@example.com https://secret.example sk-proj-syntheticcredential";
    const transport = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const request = JSON.parse(String(options?.body));
      expect(request.state.messages).toHaveLength(6);
      const sent = JSON.stringify(request.state);
      for (const secret of ["123.456", "99999", "teste@example", "secret.example", "syntheticcredential"]) expect(sent).not.toContain(secret);
      expect(request.state.messages.at(-1).text.length).toBeLessThanOrEqual(1200);
      return Response.json(body());
    });
    await classifyWithJev(Array.from({ length: 20 }, () => ({ ...messages[0], text: privateText + "a".repeat(5000) })), transport);
  });
  it.each([{ messages: [] }, { messages: [{ direction: "OUTBOUND", text: "Oi", kind: "TEXT" }] }, { messages: [{ direction: "INBOUND", text: null, kind: "AUDIO" }] }, { messages: [{ direction: "INBOUND", text: "Descrição", kind: "IMAGE" }] }])("skips nontext and absent inbound evidence", async ({ messages: input }) => {
    const transport = vi.fn(); expect((await classifyWithJev(input, transport)).status).toBe("SKIPPED"); expect(transport).not.toHaveBeenCalled();
  });
  it("does not activate aliases or invalid model configuration", async () => {
    vi.stubEnv("JEV_MODEL", "jev-latest"); expect(jevConfiguration().active).toBe(false);
    const transport = vi.fn(); expect((await classifyWithJev(messages, transport)).status).toBe("DISABLED"); expect(transport).not.toHaveBeenCalled();
  });
  it("prohibits injected transports in production", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    await expect(classifyWithJev(messages, vi.fn())).rejects.toThrow("Test hooks");
  });
});
