import { generateText, type ModelMessage, stepCountIs } from "ai";
import { createOpenRouterClient } from "../../clients/ai/openrouter";
import { basePrompt } from "../../prompts/base";
import type { ToolTypes } from "../../tools";
import { createWebSearchTool } from "../../tools/web-search";
import type { ProcessMessageOptions } from "./types";

export const mainResponse = async (
  modelMessages: ModelMessage[],
  options: ProcessMessageOptions,
) => {
  const { conversation, participants, env } = options;

  const system = `
  ${basePrompt}

${conversation.isGroup ? `You are in a group conversation. Each message from users will be prefixed with their user ID (e.g., "user-id-123: Hello") so you can identify who said what. Return back your response with NOTHING ELSE (no prefixing, no suffixing, no nothing).` : `You are in a 1-on-1 conversation with the user.`}

## Participants
${participants.map((participant) => `- ${participant.id}: ${participant.phoneNumber}`).join("\n")}

While you may call tools, ALWAYS return your response in text
`;

  const { gemini25 } = createOpenRouterClient(env.OPENROUTER_API_KEY);
  const webSearch = createWebSearchTool(env.EXASEARCH_API_KEY);

  const { text, usage } = await generateText<ToolTypes>({
    model: gemini25,
    messages: modelMessages,
    system,
    tools: {
      webSearch,
    },
    toolChoice: "auto",
    stopWhen: stepCountIs(2),
  });

  const messages: ModelMessage[] = [
    ...modelMessages,
    {
      role: "assistant",
      content: text,
    },
  ];

  return {
    usage,
    messages,
    text,
  };
};
