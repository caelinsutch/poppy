import { Conversation } from "@poppy/db";
import { generateObject, ModelMessage } from "ai";
import { ProcessMessageOptions } from "./types";
import { gemini25, openrouter } from "@/clients/ai/openrouter";
import z from "zod";
import { basePrompt } from "@/prompts/base";

export const checkShouldRespond = async (modelMessages: ModelMessage[], options: ProcessMessageOptions) => {
  const { conversation, participants } = options;

  if (!conversation.isGroup)
    return true;

  const { object } = await generateObject({
    model: gemini25,
    schema: z.object({
      shouldRespond: z.boolean(),
    }),
    messages: modelMessages,
    system: `${basePrompt}
    You are in a group conversation. Each message from users will be prefixed with their user ID (e.g., "user-id-123: Hello") so you can identify who said what. 
    
## Participants
${participants.map(participant => `- ${participant.id}: ${participant.phoneNumber}`).join('\n')}

Should you respond to this message? Think about things like the users intent, conversation history, whether you were mentiond / someone is responding to you, etc.
    `,
  });

  return object.shouldRespond;

}