import { describe, expect, it, vi } from "vitest";
import { validateMedia, mediaMaxBytes } from "@/domain/message-media";
import { EvolutionProvider } from "@/integrations/evolution-provider";
const pdf = Buffer.from("%PDF-1.4\nSynthetic private media\n%%EOF");
const key = { id: "synthetic-id", remoteJid: "15555550101@s.whatsapp.net", fromMe: false };
describe("private WhatsApp media", () => {
  it("fetches only the persisted message key through the pinned instance contract", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ mediaType: "documentMessage", mimetype: "application/pdf", base64: pdf.toString("base64"), fileName: "../../secret.html", caption: "discarded", url: "https://foreign.example.invalid" }));
    const result = await new EvolutionProvider("https://provider.example.invalid", "server-key", transport).getMessageMedia("bm_test", key, "DOCUMENT");
    expect(result.bytes).toEqual(pdf); expect(result).not.toHaveProperty("url"); expect(result).not.toHaveProperty("fileName");
    expect(transport).toHaveBeenCalledWith("https://provider.example.invalid/chat/getBase64FromMediaMessage/bm_test", expect.objectContaining({ redirect: "error", cache: "no-store", body: JSON.stringify({ message: { key }, convertToMp4: false }) }));
  });
  it("rejects active content, wrong media kind, malformed base64 and MIME/signature mismatch", async () => {
    expect(() => validateMedia("DOCUMENT", "text/html", Buffer.from("<html>"))).toThrow();
    expect(() => validateMedia("IMAGE", "image/svg+xml", Buffer.from("<svg>"))).toThrow();
    expect(() => validateMedia("DOCUMENT", "application/pdf", Buffer.from("<html>"))).toThrow();
    for (const response of [{ mediaType: "imageMessage", mimetype: "application/pdf", base64: pdf.toString("base64") }, { mediaType: "documentMessage", mimetype: "application/pdf", base64: "%PDF-1.4" }]) await expect(new EvolutionProvider("https://provider.example.invalid", "key", vi.fn().mockResolvedValue(Response.json(response))).getMessageMedia("bm_test", key, "DOCUMENT")).rejects.toMatchObject({ code: "INVALID_MEDIA" });
  });
  it("bounds both decoded media and streamed responses before parsing", async () => {
    expect(() => validateMedia("DOCUMENT", "application/pdf", Buffer.alloc(mediaMaxBytes + 1))).toThrow();
    const huge = new Response("{}", { headers: { "content-length": String(mediaMaxBytes * 2) } });
    await expect(new EvolutionProvider("https://provider.example.invalid", "key", vi.fn().mockResolvedValue(huge)).getMessageMedia("bm_test", key, "DOCUMENT")).rejects.toMatchObject({ code: "MEDIA_TOO_LARGE" });
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(mediaMaxBytes * 2)); controller.close(); } });
    await expect(new EvolutionProvider("https://provider.example.invalid", "key", vi.fn().mockResolvedValue(new Response(stream))).getMessageMedia("bm_test", key, "DOCUMENT")).rejects.toMatchObject({ code: "MEDIA_TOO_LARGE" });
  });
  it("accepts supported image/audio/video signatures and rejects hostile message keys before transport", async () => {
    expect(validateMedia("IMAGE", "image/png", Buffer.from([137,80,78,71,13,10,26,10])).extension).toBe("png");
    expect(validateMedia("AUDIO", "audio/ogg; codecs=opus", Buffer.from("OggS synthetic")).extension).toBe("ogg");
    expect(validateMedia("VIDEO", "video/mp4", Buffer.from("0000ftypisom")).extension).toBe("mp4");
    const transport = vi.fn(); await expect(new EvolutionProvider("https://provider.example.invalid", "key", transport).getMessageMedia("../tenant", key, "DOCUMENT")).rejects.toThrow();
    await expect(new EvolutionProvider("https://provider.example.invalid", "key", transport).getMessageMedia("bm_test", { ...key, remoteJid: "https://foreign.example.invalid" }, "DOCUMENT")).rejects.toThrow(); expect(transport).not.toHaveBeenCalled();
  });
});
