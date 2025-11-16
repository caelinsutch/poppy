import type { Agent, getDb } from "@poppy/db";
import { messages as messagesTable } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { generateId, tool } from "ai";
import { z } from "zod";
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
      logger
        .withTags({
          conversationId,
          interactionAgentId,
        })
        .info("send_message_to_agent tool called", {
          messageLength: message.length,
          agent_name,
          purpose,
        });

      let executionAgent: Agent | undefined;

      // If agent_name provided, find existing agent
      if (agent_name) {
        logger
          .withTags({
            conversationId,
            interactionAgentId,
          })
          .info("Looking for existing agent", {
            agent_name,
          });

        executionAgent = await findExecutionAgentByPurpose(
          db,
          interactionAgentId,
          agent_name,
        );
      }

      // Create new agent if not found
      if (!executionAgent) {
        logger
          .withTags({
            conversationId,
            interactionAgentId,
          })
          .info("Creating new execution agent", {
            purpose: purpose || agent_name || "task_executor",
          });

        executionAgent = await createExecutionAgent(db, {
          parentInteractionAgentId: interactionAgentId,
          conversationId,
          purpose: purpose || agent_name || "task_executor",
        });
      }

      logger
        .withTags({
          conversationId,
          interactionAgentId,
          executionAgentId: executionAgent.id,
        })
        .info("Recording task assignment message", {
          messagePrev: message.substring(0, 100),
        });

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

      logger
        .withTags({
          conversationId,
          interactionAgentId,
          executionAgentId: executionAgent.id,
        })
        .info("Task assigned to execution agent", {
          purpose: executionAgent.purpose,
        });

      return `Task assigned to ${executionAgent.purpose}. Agent will report back when complete.`;
    },
  });
};
