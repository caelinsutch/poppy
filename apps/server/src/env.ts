import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const env = createEnv({
  server: {
    PORT: z.coerce.number().optional().default(3000),
    HOST: z.string().optional().default('0.0.0.0'),
    LOOP_AUTHORIZATION_KEY: z.string().min(1),
    LOOP_SECRET_KEY: z.string().min(1),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
    KV_REST_API_URL: z.string().min(1),
    KV_REST_API_TOKEN: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});