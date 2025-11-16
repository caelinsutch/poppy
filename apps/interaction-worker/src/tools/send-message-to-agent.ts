import { tool } from "ai";
import { z } from "zod";
import type { getDb } from "@poppy/db";
import { messages as messagesTable } from "@poppy/db";
import { generateId } from "ai";
import {
  createExecutionAgent,
  findExecutionAgentByPurpose,
} from "../services/agents";

type Database = ReturnType<typeof getDb>;

export const createSendMessageToAgentTool = (
  db: Database,
  interactionAgentId: string,
  conversationId: string,
) => {
  return tool({
    description: `Send a message to an execution agent to accomplish a task.

The agent has tools for a wide variety of tasks. Use this tool often.
- Focus on telling the agent WHAT to do, not HOW
- Avoid technical descriptions
- If possible, send tasks to existing agents that have relevant context
- Use parallel calls when tasks are independent`,
    inputSchema: z.object({
      message: z.string().describe("The task/instruction for the agent"),
      agent_name: z
        .string()
        .optional()
        .describe(
          "Optional: name of existing agent to use. Leave empty for new agent.",
        ),
      purpose: z
        .string()
        .optional()
        .describe(
          "Optional: brief description of agent purpose (for new agents)",
        ),
    }),
    execute: async ({ message, agent_name, purpose }) => {
      let executionAgent;

      // If agent_name provided, find existing agent
      if (agent_name) {
        executionAgent = await findExecutionAgentByPurpose(
          db,
          interactionAgentId,
          agent_name,
        );
      }

      // Create new agent if not found
      if (!executionAgent) {
        executionAgent = await createExecutionAgent(db, {
          parentInteractionAgentId: interactionAgentId,
          conversationId,
          purpose: purpose || agent_name || "task_executor",
        });
      }

      // Record the message in the messages table
      await db.insert(messagesTable).values({
        id: generateId(),
        conversationId,
        fromAgentId: interactionAgentId,
        toAgentId: executionAgent.id,
        agentMessageType: "task_assignment",
        isOutbound: false,
        rawPayload: {
          role: "user",
          agentMessage: true,
        },
      });

      // Also store the message content as a part
      // Note: This will need to be updated when we properly handle parts
      // For now, return a confirmation

      // TODO: Trigger execution agent processing
      // This would enqueue a job to process the task

      return `Task assigned to ${executionAgent.purpose}. Agent will report back when complete.`;
    },
  });
};
