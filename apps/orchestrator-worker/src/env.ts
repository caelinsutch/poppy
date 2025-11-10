import { z } from "zod";

export const envSchema = z.object({
  LOOP_AUTHORIZATION_KEY: z.string().min(1),
  LOOP_SECRET_KEY: z.string().min(1),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .optional()
    .default("development"),
  OPENAI_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  EXA_API_KEY: z.string().min(1),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(env: Env): ValidatedEnv {
  return envSchema.parse(env);
}
