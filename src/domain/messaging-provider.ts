export type ConnectionState = "OPEN" | "CONNECTING" | "CLOSED";
export interface MessagingProvider {
  readonly name: string;
  getConnectionState(instanceName: string): Promise<ConnectionState>;
}
export class MessagingProviderUnavailable extends Error {
  constructor(readonly code: "NOT_CONFIGURED" | "HTTP_ERROR" | "INVALID_RESPONSE" | "UNREACHABLE") { super("Messaging provider unavailable"); }
}
