import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { MessageDirection, MessageKind } from "@prisma/client";

export const webhookMaxBytes = 262_144;
export class WebhookRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function connectionWebhookToken(connectionId: string, secret = process.env.EVOLUTION_WEBHOOK_SECRET) {
  if (!secret || secret.length < 32) throw new WebhookRequestError(503, "Webhook unavailable");
  return createHmac("sha256", secret).update(`evolution-webhook:v1:${connectionId}`).digest("hex");
}
export function verifyWebhookToken(connectionId: string, presented: string | null, secret?: string) {
  const expected = connectionWebhookToken(connectionId, secret);
  if (!presented || !/^[a-f0-9]{64}$/.test(presented) || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(presented, "hex"))) throw new WebhookRequestError(401, "Invalid webhook authentication");
}
export async function readWebhookBody(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new WebhookRequestError(415, "JSON required");
  if (Number(request.headers.get("content-length")) > webhookMaxBytes) throw new WebhookRequestError(413, "Webhook too large");
  if (!request.body) throw new WebhookRequestError(400, "Invalid webhook");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > webhookMaxBytes) { await reader.cancel(); throw new WebhookRequestError(413, "Webhook too large"); }
      chunks.push(next.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
    catch { throw new WebhookRequestError(400, "Invalid webhook"); }
  } finally { reader.releaseLock(); }
}
const envelopeSchema = z.object({ event: z.string().max(80), instance: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), data: z.unknown(), date_time: z.string().max(80).optional() });
const messageSchema = z.object({
  key: z.object({ id: z.string().min(1).max(200), remoteJid: z.string().max(100), remoteJidAlt: z.string().max(100).nullish(), fromMe: z.boolean() }),
  message: z.record(z.string(), z.unknown()).nullish(), pushName: z.string().max(200).nullish(),
  messageTimestamp: z.union([z.number(), z.string().regex(/^\d{1,12}$/)]),
});
export type NormalizedWebhookMessage = {
  providerMessageId: string; remoteJid: string; direction: MessageDirection; kind: MessageKind;
  text: string | null; displayName: string | null; occurredAt: Date;
};
export type NormalizedWebhook = { instanceName: string } & (
  { type: "messages"; messages: NormalizedWebhookMessage[] } |
  { type: "connection"; state: "OPEN" | "CLOSED" | "CONNECTING"; occurredAt: Date } |
  { type: "ignored" }
);
function invalid(): never { throw new WebhookRequestError(400, "Invalid webhook"); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function content(raw: Record<string, unknown>) {
  let message = raw;
  for (let depth = 0; depth < 3; depth++) {
    const nested = object(message.ephemeralMessage ?? message.viewOnceMessage ?? message.viewOnceMessageV2 ?? message.documentWithCaptionMessage).message;
    if (!nested) break;
    message = object(nested);
  }
  const extended = object(message.extendedTextMessage).text;
  const text = typeof message.conversation === "string" ? message.conversation : typeof extended === "string" ? extended : null;
  if (text !== null) {
    if (text.length > 16_000) invalid();
    return { kind: "TEXT" as const, text };
  }
  const media: [string, MessageKind][] = [["imageMessage", "IMAGE"], ["audioMessage", "AUDIO"], ["videoMessage", "VIDEO"], ["documentMessage", "DOCUMENT"]];
  for (const [key, kind] of media) {
    if (message[key]) {
      const caption = object(message[key]).caption;
      if (typeof caption === "string" && caption.length > 16_000) invalid();
      return { kind, text: typeof caption === "string" ? caption : null };
    }
  }
  if (message.protocolMessage || message.senderKeyDistributionMessage || !Object.keys(message).length) return null;
  return { kind: "OTHER" as const, text: null };
}
export function normalizeEvolutionWebhook(value: unknown, now = new Date()): NormalizedWebhook {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) invalid();
  const envelope = parsed.data;
  const base = { instanceName: envelope.instance };
  const event = envelope.event.toLowerCase().replaceAll("_", ".");
  if (event === "connection.update") {
    const state = z.object({ instance: z.string().optional(), state: z.enum(["open", "close", "connecting"]) }).safeParse(envelope.data);
    if (!state.success || (state.data.instance && state.data.instance !== envelope.instance)) invalid();
    const occurredAt = envelope.date_time ? new Date(envelope.date_time) : now;
    if (!Number.isFinite(occurredAt.valueOf()) || occurredAt.valueOf() > now.valueOf() + 300_000) invalid();
    return { ...base, type: "connection", state: state.data.state === "open" ? "OPEN" : state.data.state === "close" ? "CLOSED" : "CONNECTING", occurredAt };
  }
  if (event !== "messages.upsert") return { ...base, type: "ignored" };
  const data = Array.isArray(envelope.data) ? envelope.data : [envelope.data];
  if (data.length > 50) invalid();
  const messages: NormalizedWebhookMessage[] = [];
  for (const raw of data) {
    const result = messageSchema.safeParse(raw);
    if (!result.success) invalid();
    const item = result.data;
    const remoteJid = item.key.remoteJid.endsWith("@lid") && /^\d{8,15}@s\.whatsapp\.net$/.test(item.key.remoteJidAlt ?? "") ? item.key.remoteJidAlt! : item.key.remoteJid;
    if (!/^\d{8,15}@s\.whatsapp\.net$/.test(remoteJid) && !/^\d{5,20}@lid$/.test(remoteJid)) continue;
    const occurredAt = new Date(Number(item.messageTimestamp) * 1000);
    if (!Number.isFinite(occurredAt.valueOf()) || occurredAt.valueOf() < Date.UTC(2000, 0, 1) || occurredAt.valueOf() > now.valueOf() + 300_000) invalid();
    const extracted = content(item.message ?? {});
    if (!extracted) continue;
    const displayName = !item.key.fromMe ? item.pushName?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160) || null : null;
    messages.push({ providerMessageId: item.key.id, remoteJid, direction: item.key.fromMe ? "OUTBOUND" : "INBOUND", displayName, occurredAt, ...extracted });
  }
  return { ...base, type: "messages", messages };
}
