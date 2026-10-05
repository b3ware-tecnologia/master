import { z } from "zod";

export const analysisSchema = z.strictObject({
  summary: z.string().min(1).max(1200),
  intent: z.enum(["INTEREST", "QUESTION", "COMPLAINT", "OPT_OUT", "OTHER", "INSUFFICIENT_CONTEXT"]),
  nextAction: z.string().min(1).max(600),
  evidenceMessageIds: z.array(z.string().min(1)).min(1).max(10),
  requiresHumanReview: z.literal(true),
});
export type ConversationAnalysis = z.infer<typeof analysisSchema>;
export const aiInputSchema = z.strictObject({
  messages: z.array(z.strictObject({ id: z.string(), direction: z.enum(["INBOUND", "OUTBOUND"]), kind: z.string(), text: z.string().nullable(), occurredAt: z.string() })).min(1).max(50),
  truncated: z.boolean(),
});
export type AIInput = z.infer<typeof aiInputSchema>;
export class AIUnavailable extends Error {
  constructor(public readonly code: string) { super(code); }
}
