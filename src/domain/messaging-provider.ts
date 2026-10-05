export type ConnectionState = "OPEN" | "CONNECTING" | "CLOSED";
export interface MessagingProvider {
  readonly name: string;
  getConnectionState(instanceName: string): Promise<ConnectionState>;
}
export type PairingResult = { state: ConnectionState; qrCode: string | null };
export interface PairingMessagingProvider extends MessagingProvider {
  ensureInstance(instanceName: string): Promise<void>;
  requestPairing(instanceName: string): Promise<PairingResult>;
}
export interface WebhookMessagingProvider extends PairingMessagingProvider {
  configureWebhook(instanceName: string, url: string, token: string): Promise<void>;
}
export class MessagingProviderUnavailable extends Error {
  constructor(readonly code: "NOT_CONFIGURED" | "HTTP_ERROR" | "INVALID_RESPONSE" | "UNREACHABLE" | "INSTANCE_NOT_FOUND") { super("Messaging provider unavailable"); }
}
