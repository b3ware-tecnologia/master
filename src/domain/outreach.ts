import { z } from "zod";
import { decisionSchema } from "@/domain/commercial";
import type { ConciergeInput } from "@/integrations/credit-concierge";
import { jevTraceSchema } from "@/domain/jev";
export const campaignSchema = z.strictObject({ requestKey: z.uuid(), playbookId: z.string().min(1).max(100).nullable().optional(), name: z.string().trim().min(3).max(160), listId: z.string().min(1).max(100), connectionId: z.string().min(1).max(100), objective: z.string().trim().min(10).max(1200), maxContactsPerDay: z.number().int().min(1).max(20), maxTurns: z.number().int().min(1).max(12), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), followUpHours: z.number().int().min(24).max(168).nullable() }).refine((item) => new Date(item.endsAt) > new Date(item.startsAt) && new Date(item.endsAt).valueOf() - new Date(item.startsAt).valueOf() <= 90 * 86400_000, "A validade deve ser de até 90 dias.");
export const campaignActionSchema = z.strictObject({ action: z.enum(["authorize", "pause", "end"]), expectedVersion: z.number().int().min(0), confirmed: z.boolean().optional() });
export const sessionControlSchema = z.strictObject({ control: z.enum(["AI", "HUMAN"]), expectedVersion: z.number().int().min(0) });
export const outreachResultSchema = z.strictObject({ message: z.string().trim().max(1200), intent: z.enum(["INTRODUCTION", "INTEREST", "QUESTION", "HUMAN_REQUEST", "OPT_OUT", "OTHER"]), nextStep: z.enum(["CONTINUE", "HANDOFF", "STOP"]), commercialDecision: decisionSchema.optional(), toolTrace: z.array(z.strictObject({ name: z.string(), productIds: z.array(z.string()) })).optional(), jev: jevTraceSchema.optional(), evidenceIds: z.array(z.string()).max(10) }).refine((item) => item.nextStep !== "CONTINUE" || item.message.length > 0, "Mensagem obrigatória.");
export type OutreachInput = ConciergeInput;

