import { z } from "zod";
import { MessagingProviderUnavailable, type ConnectionState, type WebhookMessagingProvider, type SendingMessagingProvider, type PairingResult } from "@/domain/messaging-provider";
import { mediaMaxBytes, MessageMediaUnavailable, validateMedia, type MessageMediaProvider } from "@/domain/message-media";
import type { MessageKind } from "@prisma/client";

export const evolutionContractVersion = "2.3.7";
const responseSchema = z.object({ instance: z.object({ instanceName: z.string(), state: z.enum(["open", "connecting", "close"]) }) });
const createdSchema = z.object({ instance: z.object({ instanceName: z.string(), integration: z.literal("WHATSAPP-BAILEYS") }) });
const qrSchema = z.string().max(200_000).regex(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/);
export class EvolutionProvider implements WebhookMessagingProvider, SendingMessagingProvider, MessageMediaProvider {
  readonly name = "EVOLUTION";
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly transport: typeof fetch = fetch) {
    let url: URL;
    try { url = new URL(baseUrl); } catch { throw new MessagingProviderUnavailable("NOT_CONFIGURED"); }
    if (!apiKey) throw new MessagingProviderUnavailable("NOT_CONFIGURED");
    if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && url.hostname.endsWith(".railway.internal")))) throw new MessagingProviderUnavailable("NOT_CONFIGURED");
  }
  private validateInstance(instanceName: string) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(instanceName)) throw new MessagingProviderUnavailable("INVALID_RESPONSE");
  }
  private async request(path: string, method = "GET", body?: object) {
    let response: Response;
    try { response = await this.transport(`${this.baseUrl.replace(/\/$/, "")}${path}`, { method, headers: { apikey: this.apiKey, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) }); }
    catch { throw new MessagingProviderUnavailable("UNREACHABLE"); }
    if (!response.ok) throw new MessagingProviderUnavailable(response.status === 404 ? "INSTANCE_NOT_FOUND" : "HTTP_ERROR");
    return response;
  }
  async getConnectionState(instanceName: string): Promise<ConnectionState> {
    this.validateInstance(instanceName);
    const response = await this.request(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
    let parsed: z.infer<typeof responseSchema>;
    try { parsed = responseSchema.parse(await response.json()); } catch { throw new MessagingProviderUnavailable("INVALID_RESPONSE"); }
    if (parsed.instance.instanceName !== instanceName) throw new MessagingProviderUnavailable("INVALID_RESPONSE");
    return parsed.instance.state === "open" ? "OPEN" : parsed.instance.state === "close" ? "CLOSED" : "CONNECTING";
  }
  async sendText(instanceName: string, recipient: string, text: string) {
    this.validateInstance(instanceName);
    if (!/^[1-9]\d{9,14}$/.test(recipient) || !text.trim() || text.length > 4000) throw new MessagingProviderUnavailable("INVALID_RESPONSE");
    const response = await this.request(`/message/sendText/${encodeURIComponent(instanceName)}`, "POST", { number: recipient, text, linkPreview: false });
    try {
      const result = z.object({ key: z.object({ id: z.string().min(1).max(128), fromMe: z.literal(true), remoteJid: z.literal(`${recipient}@s.whatsapp.net`) }) }).parse(await response.json());
      return { providerMessageId: result.key.id, remoteJid: result.key.remoteJid };
    } catch { throw new MessagingProviderUnavailable("INVALID_RESPONSE"); }
    // A timeout, HTTP error or malformed response may follow an accepted send. Never retry here.
  }
  async getMessageMedia(instanceName: string, key: { id: string; remoteJid: string; fromMe: boolean }, kind: MessageKind) {
    this.validateInstance(instanceName);
    if (!key.id || key.id.length > 200 || !/^[A-Za-z0-9_-]{1,80}@(s\.whatsapp\.net|lid)$/.test(key.remoteJid) || !["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"].includes(kind)) throw new MessageMediaUnavailable("INVALID_MEDIA");
    const response = await this.request(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, "POST", { message: { key }, convertToMp4: false });
    // Bound the encoded response before JSON parsing or allocating decoded media.
    const maxEncodedBytes = Math.ceil(mediaMaxBytes / 3) * 4 + 16_384;
    if (Number(response.headers.get("content-length")) > maxEncodedBytes) { await response.body?.cancel(); throw new MessageMediaUnavailable("MEDIA_TOO_LARGE"); }
    if (!response.body) throw new MessageMediaUnavailable("MEDIA_UNAVAILABLE");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > maxEncodedBytes) { await reader.cancel(); throw new MessageMediaUnavailable("MEDIA_TOO_LARGE"); } chunks.push(next.value); }
    } catch (error) { if (error instanceof MessageMediaUnavailable) throw error; throw new MessageMediaUnavailable("MEDIA_UNAVAILABLE"); }
    finally { reader.releaseLock(); }
    try {
      const expectedType = { IMAGE: "imageMessage", AUDIO: "audioMessage", VIDEO: "videoMessage", DOCUMENT: "documentMessage" }[kind as "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"];
      const value = z.object({ mediaType: z.literal(expectedType), mimetype: z.string().max(160), base64: z.string().max(Math.ceil(mediaMaxBytes / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      return validateMedia(kind, value.mimetype, Buffer.from(value.base64, "base64"));
    } catch (error) { if (error instanceof MessageMediaUnavailable) throw error; throw new MessageMediaUnavailable("INVALID_MEDIA"); }
  }
  async ensureInstance(instanceName: string): Promise<void> {
    this.validateInstance(instanceName);
    try { await this.getConnectionState(instanceName); return; }
    catch (error) { if (!(error instanceof MessagingProviderUnavailable) || error.code !== "INSTANCE_NOT_FOUND") throw error; }
    const response = await this.request("/instance/create", "POST", {
      instanceName, integration: "WHATSAPP-BAILEYS", qrcode: false,
      readMessages: false, readStatus: false, syncFullHistory: false, alwaysOnline: false,
    });
    let parsed: z.infer<typeof createdSchema>;
    try { parsed = createdSchema.parse(await response.json()); }
    catch { throw new MessagingProviderUnavailable("INVALID_RESPONSE"); }
    if (parsed.instance.instanceName !== instanceName) throw new MessagingProviderUnavailable("INVALID_RESPONSE");
    // The provider also returns a per-instance token. Do not return or persist it.
  }
  async configureWebhook(instanceName: string, url: string, token: string): Promise<void> {
    this.validateInstance(instanceName);
    const destination = new URL(url);
    if (destination.protocol !== "https:" || destination.username || destination.password || destination.search || destination.hash || !/^[a-f0-9]{64}$/.test(token)) throw new MessagingProviderUnavailable("NOT_CONFIGURED");
    const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "SEND_MESSAGE"];
    await this.request(`/webhook/set/${encodeURIComponent(instanceName)}`, "POST", { webhook: { enabled: true, url, headers: { "x-bm-webhook-token": token }, byEvents: false, base64: false, events } });
    const readback = await this.request(`/webhook/find/${encodeURIComponent(instanceName)}`);
    try {
      const result = z.object({ enabled: z.literal(true), url: z.literal(url), headers: z.object({ "x-bm-webhook-token": z.literal(token) }), webhookByEvents: z.literal(false), webhookBase64: z.literal(false), events: z.array(z.string()) }).parse(await readback.json());
      if (result.events.length !== events.length || !events.every((event) => result.events.includes(event))) throw new Error();
    } catch { throw new MessagingProviderUnavailable("INVALID_RESPONSE"); }
    // Upstream readback contains the header secret. Return no provider payload.
  }
  async requestPairing(instanceName: string): Promise<PairingResult> {
    this.validateInstance(instanceName);
    const state = await this.getConnectionState(instanceName);
    if (state === "OPEN") return { state, qrCode: null };
    const response = await this.request(`/instance/connect/${encodeURIComponent(instanceName)}`);
    try {
      const value = z.object({ error: z.boolean().optional(), instance: z.object({ instanceName: z.string(), state: z.string().optional() }).optional(), base64: z.string().optional(), qrcode: z.object({ base64: z.string().optional() }).optional(), count: z.number().optional() }).parse(await response.json());
      if (value.error) throw new MessagingProviderUnavailable("HTTP_ERROR");
      if (value.instance && value.instance.instanceName !== instanceName) throw new MessagingProviderUnavailable("INVALID_RESPONSE");
      if (value.instance?.state === "open") return { state: "OPEN", qrCode: null };
      const image = value.base64 ?? value.qrcode?.base64;
      if (image) return { state: "CONNECTING", qrCode: qrSchema.parse(image) };
      if (value.count !== undefined || value.instance?.state === "connecting") return { state: "CONNECTING", qrCode: null };
      throw new MessagingProviderUnavailable("INVALID_RESPONSE");
    } catch (error) {
      if (error instanceof MessagingProviderUnavailable) throw error;
      throw new MessagingProviderUnavailable("INVALID_RESPONSE");
    }
  }
}
export function configuredEvolutionProvider(): WebhookMessagingProvider & SendingMessagingProvider & MessageMediaProvider {
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) throw new MessagingProviderUnavailable("NOT_CONFIGURED");
  return new EvolutionProvider(process.env.EVOLUTION_API_URL, process.env.EVOLUTION_API_KEY);
}
