import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const gemini25 = (apiKey: string) => {
  const openrouter = createOpenRouter({
    apiKey,
  });

  return openrouter("google/gemini-2.5-flash");
};
