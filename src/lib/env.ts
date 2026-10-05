import { z } from "zod";

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1), REDIS_URL: z.string().min(1), APP_URL: z.string().url(),
  AUTH_SECRET: z.string().optional(), OPENAI_API_KEY: z.string().optional(), OPENAI_MODEL: z.enum(["gpt-6-luna"]).optional(),
  WHATSAPP_OUTBOUND_ENABLED: z.enum(["true", "false"]).default("false"),
  EVOLUTION_API_URL: z.string().url().optional(), EVOLUTION_API_KEY: z.string().optional(), EVOLUTION_WEBHOOK_SECRET: z.string().min(32).optional(), ENCRYPTION_KEY: z.string().optional()
});
export function parseEnvironment(input: NodeJS.ProcessEnv = process.env) {
  return environmentSchema.parse(input);
}

