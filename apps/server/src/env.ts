import { createEnv } from "@t3-oss/env-core";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export const env = createEnv({
  server: {
    PORT: z.coerce.number().optional().default(3000),
    HOST: z.string().optional().default("0.0.0.0"),
    LOOP_AUTHORIZATION_KEY: z.string().min(1),
    LOOP_SECRET_KEY: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .optional()
      .default("development"),
    REDIS_HOST: z.string().optional().default("localhost"),
    REDIS_PORT: z.coerce.number().optional().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().optional().default(0),
    OPENAI_API_KEY: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    EXA_API_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
