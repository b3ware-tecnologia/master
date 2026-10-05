import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithGateway, aiConfiguration } from "./ai-gateway";

const input = { messages: [{ id: "m1", direction: "INBOUND" as const, kind: "TEXT", text: "Tenho uma dúvida", occurredAt: new Date(0).toISOString() }], truncated: false };
const analysis = { summary: "Cliente relata uma dúvida.", intent: "QUESTION", nextAction: "Solicitar esclarecimento.", evidenceMessageIds: ["m1"], requiresHumanReview: true };
function provider(result: unknown = analysis, extra: object = {}) { return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }], usage: { input_tokens: 50, output_tokens: 40 }, ...extra }); }
afterEach(() => vi.unstubAllEnvs());
describe("Conversation AIGateway", () => {
  it("does not call the provider without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetcher = vi.fn();
    expect(aiConfiguration().configured).toBe(false);
    await expect(analyzeWithGateway(input, "gpt-6-luna", fetcher)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses Responses with a strict schema, no tools, bounded output and store=false", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
    const fetcher = vi.fn(async (_url: unknown, options: RequestInit | undefined) => {
      const body = JSON.parse(String(options?.body));
      expect(body.store).toBe(false); expect(body.tools).toBeUndefined(); expect(body.max_output_tokens).toBe(2200);
      expect(body.text.format.strict).toBe(true); expect(body.reasoning.effort).toBe("low");
      return provider();
    });
    expect((await analyzeWithGateway(input, "gpt-6-luna", fetcher)).result.intent).toBe("QUESTION");
  });
  it.each([
    { ...analysis, evidenceMessageIds: ["foreign-message"] },
    { ...analysis, requiresHumanReview: false },
    { ...analysis, eligibility: "approved" },
  ])("rejects invalid or unsupported evidence/output", async (result) => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
    await expect(analyzeWithGateway(input, "gpt-6-luna", async () => provider(result))).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });
  it("never exposes provider error bodies or exception content", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
    await expect(analyzeWithGateway(input, "gpt-6-luna", async () => new Response("private-secret-and-message", { status: 401 }))).rejects.toMatchObject({ message: "CREDENTIALS_REJECTED" });
    await expect(analyzeWithGateway(input, "gpt-6-luna", async () => { throw new Error("private-secret-and-message"); })).rejects.toMatchObject({ message: "TRANSPORT_ERROR" });
  });
  it("rejects incomplete responses, refusals and missing usage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
    await expect(analyzeWithGateway(input, "gpt-6-luna", async () => provider(analysis, { status: "incomplete" }))).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    await expect(analyzeWithGateway(input, "gpt-6-luna", async () => provider(analysis, { usage: null }))).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    await expect(analyzeWithGateway(input, "gpt-6-luna", async () => provider(analysis, { output: [{ type: "message", content: [{ type: "refusal" }] }] }))).rejects.toMatchObject({ code: "REFUSED" });
  });
  it("disables injected transports in production", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    await expect(analyzeWithGateway(input, "gpt-6-luna", async () => provider())).rejects.toThrow("Test hooks");
  });
});
