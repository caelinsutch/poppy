import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const createOpenRouterClient = (apiKey: string) => {
  const openrouter = createOpenRouter({
    apiKey,
  });

  return {
    openrouter,
    gemini25: openrouter("google/gemini-2.5-flash"),
  };
};
