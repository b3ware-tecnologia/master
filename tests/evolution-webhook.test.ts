import { describe, expect, it } from "vitest";
import { connectionWebhookToken, normalizeEvolutionWebhook, readWebhookBody, verifyWebhookToken, webhookMaxBytes } from "@/integrations/evolution-webhook";

const secret = "synthetic-webhook-secret-at-least-32-characters";
const data = { key: { id: "synthetic-message", remoteJid: "5511999990000@s.whatsapp.net", fromMe: false }, message: { conversation: "Texto de teste" }, pushName: "Contato", messageTimestamp: Math.floor(Date.now() / 1000) };
function envelope(value: object = data) { return { event: "messages.upsert", instance: "synthetic", data: value, apikey: "provider-secret-never-persist" }; }
describe("Evolution webhook boundary", () => {
  it("authenticates per binding, rejects replay across bindings and fails closed without configuration", () => {
    const token = connectionWebhookToken("binding-a", secret);
    expect(() => verifyWebhookToken("binding-a", token, secret)).not.toThrow();
    for (const invalid of [null, "a".repeat(64), connectionWebhookToken("binding-b", secret)]) expect(() => verifyWebhookToken("binding-a", invalid, secret)).toThrow("Invalid webhook authentication");
    expect(() => connectionWebhookToken("a", "")).toThrow("Webhook unavailable");
  });
  it("normalizes direct text without persisting envelope secrets or media URLs", () => {
    const result = normalizeEvolutionWebhook(envelope());
    expect(result).toMatchObject({ type: "messages", messages: [{ direction: "INBOUND", text: "Texto de teste", kind: "TEXT" }] });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
    expect(normalizeEvolutionWebhook(envelope({ ...data, message: { documentMessage: { caption: "Documento", url: "https://secret.example", mediaKey: "secret-media-key" } } }))).toMatchObject({ messages: [{ kind: "DOCUMENT", text: "Documento" }] });
  });
  it("handles phone aliases for LID and mirrors outbound phone messages without auto-sending", () => {
    expect(normalizeEvolutionWebhook(envelope({ ...data, key: { ...data.key, remoteJid: "123456789@lid", remoteJidAlt: data.key.remoteJid, fromMe: true } }))).toMatchObject({ messages: [{ remoteJid: data.key.remoteJid, direction: "OUTBOUND", displayName: null }] });
  });
  it("observes API SEND_MESSAGE events only when the message is outbound", () => {
    expect(normalizeEvolutionWebhook({ ...envelope(), event: "SEND_MESSAGE", data: { ...data, key: { ...data.key, fromMe: true } } })).toMatchObject({ messages: [{ direction: "OUTBOUND", text: "Texto de teste" }] });
    expect(() => normalizeEvolutionWebhook({ ...envelope(), event: "send.message" })).toThrow("Invalid webhook");
  });
  it("excludes groups, status broadcasts, history events and protocol-only messages", () => {
    for (const jid of ["12345@g.us", "status@broadcast", "123@newsletter"]) expect(normalizeEvolutionWebhook(envelope({ ...data, key: { ...data.key, remoteJid: jid } }))).toMatchObject({ messages: [] });
    expect(normalizeEvolutionWebhook({ ...envelope(), event: "messages.set" })).toMatchObject({ type: "ignored" });
    expect(normalizeEvolutionWebhook(envelope({ ...data, message: { protocolMessage: { key: "do-not-store" } } }))).toMatchObject({ messages: [] });
  });
  it("rejects malformed batches, invalid timestamps and oversized text atomically", () => {
    for (const value of [{ ...data, messageTimestamp: 0 }, { ...data, messageTimestamp: Math.floor(Date.now() / 1000) + 3600 }, { ...data, message: { conversation: "x".repeat(16_001) } }, { ...data, key: { ...data.key, fromMe: "false" } }]) expect(() => normalizeEvolutionWebhook(envelope(value))).toThrow("Invalid webhook");
    expect(() => normalizeEvolutionWebhook({ ...envelope(), data: [data, {}] })).toThrow();
  });
  it("bounds actual streamed bytes even without a Content-Length header", async () => {
    const request = new Request("https://example.invalid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: "x".repeat(webhookMaxBytes) }) });
    await expect(readWebhookBody(request)).rejects.toMatchObject({ status: 413 });
    await expect(readWebhookBody(new Request("https://example.invalid", { method: "POST", body: "{}" }))).rejects.toMatchObject({ status: 415 });
    await expect(readWebhookBody(new Request("https://example.invalid", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 });
  });
});
