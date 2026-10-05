import { describe, it, expect, vi } from "vitest";
import { EvolutionProvider } from "@/integrations/evolution-provider";
import { outboundRequestSchema } from "@/domain/outbound";
import { roleCapabilities } from "@/domain/access";
describe("reviewed outbound transport", () => {
  it("requires explicit confirmation and refuses caller-supplied text, phone and tenant", () => {
    const data = { requestKey: crypto.randomUUID(), planId: "plan", recipientIdentifierId: "identifier", snapshotHash: "a".repeat(64), confirmed: true };
    expect(outboundRequestSchema.safeParse(data).success).toBe(true);
    for (const extra of [{ confirmed: false }, { message: "override" }, { recipient: "15555550101" }, { tenantId: "foreign" }]) expect(outboundRequestSchema.safeParse({ ...data, ...extra }).success).toBe(false);
    expect(roleCapabilities.TENANT_MASTER).toContain("messaging.send");
    for (const role of ["TENANT_MANAGER", "CONSULTANT", "PLATFORM_ADMIN"] as const) expect(roleCapabilities[role]).not.toContain("messaging.send");
  });
  it("sends the reviewed text once and validates the acknowledged recipient", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ key: { id: "accepted-1", fromMe: true, remoteJid: "15555550101@s.whatsapp.net" }, privateProviderData: "excluded" }));
    const provider = new EvolutionProvider("https://provider.example.invalid", "synthetic-key", transport);
    expect(await provider.sendText("synthetic", "15555550101", "Reviewed text")).toEqual({ providerMessageId: "accepted-1", remoteJid: "15555550101@s.whatsapp.net" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("https://provider.example.invalid/message/sendText/synthetic");
    expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ number: "15555550101", text: "Reviewed text", linkPreview: false });
    expect(transport.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { apikey: "synthetic-key", "Content-Type": "application/json" } });
  });
  it.each([{ key: { id: "1", fromMe: true, remoteJid: "foreign@s.whatsapp.net" } }, { key: { id: "1", fromMe: false, remoteJid: "15555550101@s.whatsapp.net" } }, { private: "provider-secret" }])("rejects an unsafe acknowledgement without retrying", async (body) => {
    const transport = vi.fn().mockResolvedValue(Response.json(body));
    await expect(new EvolutionProvider("https://provider.example.invalid", "key", transport).sendText("synthetic", "15555550101", "Text")).rejects.toMatchObject({ code: "INVALID_RESPONSE", message: "Messaging provider unavailable" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("does not retry a timeout or disclose its provider diagnostic", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("private network/provider secret"));
    await expect(new EvolutionProvider("https://provider.example.invalid", "key", transport).sendText("synthetic", "15555550101", "Text")).rejects.toMatchObject({ code: "UNREACHABLE", message: "Messaging provider unavailable" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid targets before any network call", async () => {
    const transport = vi.fn(); const provider = new EvolutionProvider("https://provider.example.invalid", "key", transport);
    for (const [instance, number, text] of [["../foreign", "15555550101", "Text"], ["synthetic", "123@lid", "Text"], ["synthetic", "15555550101", " "]]) await expect(provider.sendText(instance, number, text)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(transport).not.toHaveBeenCalled();
  });
});
