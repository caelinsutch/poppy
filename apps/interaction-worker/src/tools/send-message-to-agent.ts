import type { Agent, getDb } from "@poppy/db";
import { messages as messagesTable } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { generateId, tool } from "ai";
import { z } from "zod";
import type { WorkerEnv } from "../context";
import {
  createExecutionAgent,
  findExecutionAgentByPurpose,
} from "../services/agents";

type Database = ReturnType<typeof getDb>;

export const createSendMessageToAgentTool = (
  db: Database,
  interactionAgentId: string,
  conversationId: string,
  env: WorkerEnv,
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

      // Call execution-worker via RPC to execute the task
      logger
        .withTags({
          conversationId,
          interactionAgentId,
          executionAgentId: executionAgent.id,
        })
        .info("Calling execution-worker via RPC", {
          purpose: executionAgent.purpose,
        });

      try {
        // Get the Durable Object stub for this execution agent
        const id = env.EXECUTION_AGENT.idFromName(executionAgent.id);
        const stub = env.EXECUTION_AGENT.get(id) as any;

        // Call the executeTask method via RPC (returns immediately)
        const result = (await stub.executeTask({
          agentId: executionAgent.id,
          conversationId,
          taskDescription: message,
        })) as { success: boolean; message: string };

        logger
          .withTags({
            conversationId,
            interactionAgentId,
            executionAgentId: executionAgent.id,
          })
          .info("Execution-worker RPC call initiated", result);

        if (result.success) {
          return `Task has been assigned to ${executionAgent.purpose} and is now executing in the background. You will receive the results when the task completes.`;
        }

        return `Task execution failed to start: ${result.message}`;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger
          .withTags({
            conversationId,
            interactionAgentId,
            executionAgentId: executionAgent.id,
          })
          .error("Failed to call execution-worker via RPC", {
            error: errorMessage,
          });

        return `Task execution failed: ${errorMessage}`;
      }
    },
  });
};
