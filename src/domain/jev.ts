import { z } from "zod";
const unit = z.number().finite().min(0).max(1);
export const jevTraceSchema = z.strictObject({
  status: z.enum(["DISABLED", "NOT_CONFIGURED", "SKIPPED", "CLASSIFIED", "LOW_CONFIDENCE", "UNAVAILABLE"]),
  model: z.string().max(80).nullable(), promptVersion: z.string().max(80),
  intent: z.enum(["GREETING", "FINANCIAL_QUESTION", "INTEREST", "BUSY", "NOT_INTERESTED", "OPT_OUT", "WRONG_NUMBER", "HUMAN_REQUEST", "COMPLAINT", "OTHER"]).nullable(),
  objection: z.enum(["NONE", "TIMING", "TRUST", "COST", "ALREADY_SERVED", "NO_NEED", "OTHER"]).nullable(),
  confidence: unit.nullable(), financialContext: unit.nullable(), inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(), latencyMs: z.number().int().nonnegative(), omitInitialCatalog: z.boolean(),
});
export type JevTrace = z.infer<typeof jevTraceSchema>;

