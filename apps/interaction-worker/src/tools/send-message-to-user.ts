import { tool } from "ai";
import { z } from "zod";

/**
 * Tool for interaction agent to explicitly send messages to the user
 * Returns structured data that will be processed after agent.generate() completes
 */
export const sendMessageToUser = tool({
  description: `Send a message to the user via SMS.

- Use this to acknowledge requests, provide updates, or respond to questions
- The user can only see messages you send via this tool
- You can choose NOT to call this tool if you just want to make internal notes
- Records a natural-language reply for the user to read`,
  inputSchema: z.object({
    message: z.string().describe("The message to send to the user"),
  }),
  execute: async ({ message }) => {
    // Return structured data that will be collected and processed
    // by the response handler
    return {
      type: "send_to_user" as const,
      content: message,
    };
  },
});
