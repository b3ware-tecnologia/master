import { describe, expect, it, vi } from "vitest";
import { EvolutionProvider } from "@/integrations/evolution-provider";
import { MessagingProviderUnavailable } from "@/domain/messaging-provider";

describe("Evolution connection adapter", () => {
  it("uses the pinned contract endpoint with server header and safe request options", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ instance: { instanceName: "bm_test", state: "open" } }));
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
});
