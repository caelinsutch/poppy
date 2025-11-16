import { tool } from "ai";
import { z } from "zod";

/**
 * Tool for the interaction agent to avoid duplicate responses
 * Adds a silent log entry when agent detects redundant messages
 */
export const wait = tool({
  description: `Use this when you detect a message/response is already present in conversation history and you want to avoid duplicating it.

This adds a silent log entry that prevents redundant messages to the user.
- Use when you see that the same draft, confirmation, or response has already been sent
- Always provide a clear reason explaining what you're avoiding duplicating`,
  inputSchema: z.object({
    reason: z.string().describe("Why you're waiting (what you're avoiding)"),
  }),
  execute: async ({ reason }) => {
    // This just returns a log entry - the tool call itself serves as the log
    return `<wait>${reason}</wait>`;
  },
});
