import { generateObject, type ModelMessage } from "ai";
import z from "zod";
import { createOpenRouterClient } from "../../clients/ai/openrouter";
import { basePrompt } from "../../prompts/base";
import type { ProcessMessageOptions } from "./types";

export const checkShouldRespond = async (
  modelMessages: ModelMessage[],
  options: ProcessMessageOptions,
) => {
  const { conversation, participants, env } = options;

  if (!conversation.isGroup) return true;

  const { gemini25 } = createOpenRouterClient(env.OPENROUTER_API_KEY);

  const { object } = await generateObject({
    model: gemini25,
    schema: z.object({
      shouldRespond: z.boolean(),
    }),
    messages: modelMessages,
    system: `${basePrompt}
    You are in a group conversation. Each message from users will be prefixed with their user ID (e.g., "user-id-123: Hello") so you can identify who said what.

## Participants
${participants.map((participant) => `- ${participant.id}: ${participant.phoneNumber}`).join("\n")}

Return whether or not you should respond to this message. ALWAYS respond if a user mentions you (i.e. Poppy ___) otherwise use your best judgement - if other people in the group are talking to each other then you should not respond.
    `,
  });

  return object.shouldRespond;
};
