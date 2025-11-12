import { type ModelMessage, stepCountIs, ToolLoopAgent } from "ai";
import { gemini25 } from "../../clients/ai/openrouter";
import { basePrompt } from "../../prompts/base";
import { webSearch } from "../../tools/web-search";
import type { ProcessMessageOptions } from "./types";

export const mainResponse = async (
  modelMessages: ModelMessage[],
  options: ProcessMessageOptions,
) => {
  const { conversation, participants } = options;

  const system = `
  ${basePrompt}

${conversation.isGroup ? `You are in a group conversation. Each message from users will be prefixed with their user ID (e.g., "user-id-123: Hello") so you can identify who said what. Return back your response with NOTHING ELSE (no prefixing, no suffixing, no nothing).` : `You are in a 1-on-1 conversation with the user.`}

## Participants
${participants.map((participant) => `- ${participant.id}: ${participant.phoneNumber}`).join("\n")}

While you may call tools, ALWAYS return your response in text
`;

  const agent = new ToolLoopAgent({
    model: gemini25,
    instructions: system,
    tools: {
      webSearch,
    },
    stopWhen: stepCountIs(10), // Allow up to 20 steps
  });

  const { text, usage } = await agent.generate({
    messages: modelMessages,
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
