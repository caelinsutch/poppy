import { openai } from "@/clients/openai";
import { ProcessMessageOptions } from "./types";
import { generateText, ModelMessage } from "ai";

export const mainResponse = async (modelMessages: ModelMessage[], options: ProcessMessageOptions) => {
  const { conversation, participants } = options;


  const system = `
  You are a helpful assistant that can answer questions and help with tasks.
  You are currently in a conversation with the user.
  ${conversation.isGroup ? `You are in a group conversation. Each message from users will be prefixed with their user ID (e.g., "user-id-123: Hello") so you can identify who said what. Return back your response with NOTHING ELSE (no prefixing, no suffixing, no nothing).` : `You are in a 1-on-1 conversation with the user.`}
  ## Participants
  ${participants.map(participant => `- ${participant.id}: ${participant.phoneNumber}`).join('\n')}
  `;

  const response = await generateText({
    model: openai('gpt-5'),
    messages: modelMessages,
    system,
  });

  return response
};