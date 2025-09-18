import { openai } from "@/clients/openai";
import { ProcessMessageOptions } from "./types";
import { generateText, ModelMessage } from "ai";
import { basePrompt } from "@/prompts/base";

export const mainResponse = async (modelMessages: ModelMessage[], options: ProcessMessageOptions) => {
  const { conversation, participants } = options;


  const system = `
  ${basePrompt}
  
${conversation.isGroup ? `You are in a group conversation. Each message from users will be prefixed with their user ID (e.g., "user-id-123: Hello") so you can identify who said what. Return back your response with NOTHING ELSE (no prefixing, no suffixing, no nothing).` : `You are in a 1-on-1 conversation with the user.`}

## Participants
${participants.map(participant => `- ${participant.id}: ${participant.phoneNumber}`).join('\n')}
  `;

  const response = await generateText({
    model: openai('gpt-4.1'),
    messages: modelMessages,
    system,
    tools: {
      webSearch: openai.tools.webSearch({
      }),
    },
  });

  return response
};