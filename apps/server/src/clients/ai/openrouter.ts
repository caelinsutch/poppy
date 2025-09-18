import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';

export const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
});

export const gemini25 = openrouter('google/gemini-2.5-flash');