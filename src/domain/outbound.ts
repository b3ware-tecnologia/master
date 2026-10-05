import { z } from "zod";
export const outboundRequestSchema = z.object({ requestKey: z.uuid(), planId: z.string().min(1).max(100), recipientIdentifierId: z.string().min(1).max(100), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();
export const outboundCancelSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();
export const outboundReconcileSchema = z.object({ expectedVersion: z.number().int().nonnegative(), messageId: z.string().min(1).max(100) }).strict();
export class OutboundDisabled extends Error { constructor() { super("O envio de WhatsApp ainda não está ativado."); } }
export function outboundEnabled() { return process.env.WHATSAPP_OUTBOUND_ENABLED === "true"; }
