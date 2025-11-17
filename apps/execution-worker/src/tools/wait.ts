import { tool } from "ai";
import { z } from "zod";

export const createWaitTool = () => {
  return tool({
    description: `Wait for a specified amount of time before continuing. Use this when you need to pause execution or wait for external events.`,
    inputSchema: z.object({
      seconds: z.number().describe("Number of seconds to wait"),
      reason: z.string().optional().describe("Optional reason for waiting"),
    }),
    execute: async ({ seconds, reason }) => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return {
        type: "wait_complete" as const,
        seconds,
        reason,
        completedAt: new Date().toISOString(),
      };
    },
  });
};
