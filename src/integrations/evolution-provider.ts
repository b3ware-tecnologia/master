import { z } from "zod";
import { MessagingProviderUnavailable, type ConnectionState, type MessagingProvider } from "@/domain/messaging-provider";

export const evolutionContractVersion = "2.3.7";
const responseSchema = z.object({ instance: z.object({ instanceName: z.string(), state: z.enum(["open", "connecting", "close"]) }) });
export class EvolutionProvider implements MessagingProvider {
  readonly name = "EVOLUTION";
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly transport: typeof fetch = fetch) {
    let url: URL;
    try { url = new URL(baseUrl); } catch { throw new MessagingProviderUnavailable("NOT_CONFIGURED"); }
    if (!apiKey) throw new MessagingProviderUnavailable("NOT_CONFIGURED");
    if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && url.hostname.endsWith(".railway.internal")))) throw new MessagingProviderUnavailable("NOT_CONFIGURED");
  }
  async getConnectionState(instanceName: string): Promise<ConnectionState> {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(instanceName)) throw new MessagingProviderUnavailable("INVALID_RESPONSE");
    let response: Response;
    try { response = await this.transport(`${this.baseUrl.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET", headers: { apikey: this.apiKey }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) }); }
    catch { throw new MessagingProviderUnavailable("UNREACHABLE"); }
    if (!response.ok) throw new MessagingProviderUnavailable("HTTP_ERROR");
    let parsed: z.infer<typeof responseSchema>;
    try { parsed = responseSchema.parse(await response.json()); } catch { throw new MessagingProviderUnavailable("INVALID_RESPONSE"); }
    if (parsed.instance.instanceName !== instanceName) throw new MessagingProviderUnavailable("INVALID_RESPONSE");
    return parsed.instance.state === "open" ? "OPEN" : parsed.instance.state === "close" ? "CLOSED" : "CONNECTING";
  }
}
export function configuredEvolutionProvider(): MessagingProvider {
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) throw new MessagingProviderUnavailable("NOT_CONFIGURED");
  return new EvolutionProvider(process.env.EVOLUTION_API_URL, process.env.EVOLUTION_API_KEY);
}
