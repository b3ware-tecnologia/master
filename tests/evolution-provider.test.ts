import { describe, expect, it, vi } from "vitest";
import { EvolutionProvider } from "@/integrations/evolution-provider";
import { MessagingProviderUnavailable } from "@/domain/messaging-provider";

describe("Evolution connection adapter", () => {
  it("configures only selected instance events with a header secret and verifies the readback", async () => {
    const url = "https://crm.example.invalid/api/webhooks/evolution/binding";
    const token = "a".repeat(64);
    const response = { enabled: true, url, headers: { "x-bm-webhook-token": token }, webhookByEvents: false, webhookBase64: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE"] };
    const transport = vi.fn().mockResolvedValueOnce(Response.json(response, { status: 201 })).mockResolvedValueOnce(Response.json(response));
    expect(await new EvolutionProvider("https://provider.example.invalid", "key", transport).configureWebhook("bm_test", url, token)).toBeUndefined();
    expect(transport.mock.calls[0][0]).toBe("https://provider.example.invalid/webhook/set/bm_test");
    const body = JSON.parse(transport.mock.calls[0][1].body);
    expect(body.webhook).toMatchObject({ byEvents: false, base64: false, headers: { "x-bm-webhook-token": token } });
    const wrong = vi.fn().mockResolvedValue(Response.json({ ...response, url: "https://foreign.example.invalid" }));
    await expect(new EvolutionProvider("https://provider.example.invalid", "key", wrong).configureWebhook("bm_test", url, token)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("uses the pinned contract endpoint with server header and safe request options", async () => {
    const transport = vi.fn().mockImplementation(async () => Response.json({ instance: { instanceName: "bm_test", state: "open" } }));
    const provider = new EvolutionProvider("https://provider.example.invalid/", "synthetic-key", transport);
    expect(await provider.getConnectionState("bm_test")).toBe("OPEN");
    expect(transport).toHaveBeenCalledWith("https://provider.example.invalid/instance/connectionState/bm_test", expect.objectContaining({ method: "GET", headers: { apikey: "synthetic-key" }, redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it("rejects cross-instance responses and replaces upstream bodies with safe error codes", async () => {
    const provider = new EvolutionProvider("https://provider.example.invalid", "synthetic-key", vi.fn().mockResolvedValue(Response.json({ instance: { instanceName: "another_tenant", state: "open" } })));
    await expect(provider.getConnectionState("bm_test")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    const failing = new EvolutionProvider("https://provider.example.invalid", "synthetic-key", vi.fn().mockResolvedValue(new Response("secret provider details", { status: 401 })));
    await expect(failing.getConnectionState("bm_test")).rejects.toMatchObject({ code: "HTTP_ERROR", message: "Messaging provider unavailable" });
  });
  it("rejects insecure public URLs, credentials in URLs and path injection", async () => {
    expect(() => new EvolutionProvider("http://public.example.invalid", "key")).toThrow(MessagingProviderUnavailable);
    expect(() => new EvolutionProvider("https://user:password@provider.example.invalid", "key")).toThrow(MessagingProviderUnavailable);
    const transport = vi.fn(); const provider = new EvolutionProvider("https://provider.example.invalid", "key", transport);
    await expect(provider.getConnectionState("../foreign")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("creates only a confirmed missing instance and never returns provider tokens", async () => {
    const transport = vi.fn().mockResolvedValueOnce(new Response("not found", { status: 404 })).mockResolvedValueOnce(Response.json({ instance: { instanceName: "bm_test", integration: "WHATSAPP-BAILEYS" }, hash: "secret-instance-token" }, { status: 201 }));
    const provider = new EvolutionProvider("https://provider.example.invalid", "synthetic-key", transport);
    expect(await provider.ensureInstance("bm_test")).toBeUndefined();
    expect(transport).toHaveBeenLastCalledWith("https://provider.example.invalid/instance/create", expect.objectContaining({ method: "POST", body: expect.any(String) }));
    const body = JSON.parse(transport.mock.calls[1][1].body);
    expect(body).toMatchObject({ instanceName: "bm_test", integration: "WHATSAPP-BAILEYS", qrcode: false, readMessages: false, syncFullHistory: false });
    const forbidden = vi.fn().mockResolvedValue(new Response("credential failure", { status: 401 }));
    await expect(new EvolutionProvider("https://provider.example.invalid", "key", forbidden).ensureInstance("bm_test")).rejects.toMatchObject({ code: "HTTP_ERROR" });
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
  it("reuses an existing instance and does not reconnect an OPEN session", async () => {
    const transport = vi.fn().mockImplementation(async () => Response.json({ instance: { instanceName: "bm_test", state: "open" } }));
    const provider = new EvolutionProvider("https://provider.example.invalid", "key", transport);
    await provider.ensureInstance("bm_test");
    expect(await provider.requestPairing("bm_test")).toEqual({ state: "OPEN", qrCode: null });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.every(([url]) => url.includes("connectionState"))).toBe(true);
  });
  it("returns only a validated PNG QR and strips pairing codes, tokens and raw QR strings", async () => {
    const image = "data:image/png;base64,iVBORw0KGgoAAA==";
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ instance: { instanceName: "bm_test", state: "close" } })).mockResolvedValueOnce(Response.json({ base64: image, count: 1, code: "secret-raw-qr", pairingCode: "secret-pairing-code", token: "secret-token" }));
    const provider = new EvolutionProvider("https://provider.example.invalid", "key", transport);
    expect(await provider.requestPairing("bm_test")).toEqual({ state: "CONNECTING", qrCode: image });
  });
  it("rejects non-PNG images and foreign-instance pairing responses", async () => {
    for (const body of [{ base64: "data:image/svg+xml;base64,PHN2Zz4=" }, { instance: { instanceName: "another_tenant", state: "open" } }, { error: true, message: "secret diagnostic" }]) {
      const transport = vi.fn().mockResolvedValueOnce(Response.json({ instance: { instanceName: "bm_test", state: "close" } })).mockResolvedValueOnce(Response.json(body));
      await expect(new EvolutionProvider("https://provider.example.invalid", "key", transport).requestPairing("bm_test")).rejects.toThrow("Messaging provider unavailable");
    }
  });
  it("treats an empty QR generation result as pending and rejects unknown success bodies", async () => {
    for (const [body, pending] of [[{ count: 0 }, true], [{ arbitrary: "payload" }, false]] as const) {
      const transport = vi.fn().mockResolvedValueOnce(Response.json({ instance: { instanceName: "bm_test", state: "connecting" } })).mockResolvedValueOnce(Response.json(body));
      const result = new EvolutionProvider("https://provider.example.invalid", "key", transport).requestPairing("bm_test");
      if (pending) expect(await result).toEqual({ state: "CONNECTING", qrCode: null });
      else await expect(result).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
});
