import { z } from "zod";
import { MessagingProviderUnavailable, type ConnectionState, type PairingMessagingProvider, type PairingResult } from "@/domain/messaging-provider";

export const evolutionContractVersion = "2.3.7";
const responseSchema = z.object({ instance: z.object({ instanceName: z.string(), state: z.enum(["open", "connecting", "close"]) }) });
const createdSchema = z.object({ instance: z.object({ instanceName: z.string(), integration: z.literal("WHATSAPP-BAILEYS") }) });
const qrSchema = z.string().max(200_000).regex(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/);
export class EvolutionProvider implements PairingMessagingProvider {
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
export function configuredEvolutionProvider(): PairingMessagingProvider {
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) throw new MessagingProviderUnavailable("NOT_CONFIGURED");
  return new EvolutionProvider(process.env.EVOLUTION_API_URL, process.env.EVOLUTION_API_KEY);
}
