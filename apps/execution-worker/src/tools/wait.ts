import { logger } from "@poppy/hono-helpers";
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
      logger.info("Wait tool: Starting wait", {
        seconds,
        reason,
      });

      const startTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      const actualWaitTime = (Date.now() - startTime) / 1000;

      const result = {
        type: "wait_complete" as const,
        seconds,
        reason,
        completedAt: new Date().toISOString(),
      };

      logger.info("Wait tool: Wait completed", {
        requestedSeconds: seconds,
        actualSeconds: actualWaitTime.toFixed(2),
        reason,
      });

      return result;
    },
  });
};
