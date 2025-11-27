import { getDb } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { Agent, callable } from "agents";
import { stepCountIs, ToolLoopAgent } from "ai";
import { gemini25 } from "../clients/ai";
import type { WorkerEnv } from "../context";
import { updateAgentStatus } from "../services/agent-manager";
import { createResearchTool } from "../tools/research";
import { createWaitTool } from "../tools/wait";
import type { ExecutionState, TaskInput } from "../types";

export class ExecutionAgent extends Agent<WorkerEnv, ExecutionState> {
  initialState: ExecutionState = {
    isExecuting: false,
  };

  /**
   * Execute task in background and ping interaction worker when done
   */
  private async executeTaskInBackground(input: TaskInput): Promise<void> {
    this.setState({ isExecuting: true });

    logger
      .withTags({
        agentId: input.agentId,
        conversationId: input.conversationId,
      })
      .info("ExecutionAgent: Starting task execution", {
        taskDescription: input.taskDescription.substring(0, 200),
        taskLength: input.taskDescription.length,
      });

    try {
      const db = getDb(this.env.HYPERDRIVE.connectionString);

      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Updating agent status to active");

      await updateAgentStatus(db, input.agentId, "active");

      // Get agent details from database
      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Fetching agent record from database");

      const agentRecord = await db.query.agents.findFirst({
        where: (agents, { eq }) => eq(agents.id, input.agentId),
      });

      if (!agentRecord) {
        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .error("ExecutionAgent: Agent record not found");

        throw new Error("Agent record not found");
      }

      const agentName = agentRecord?.purpose || "execution_agent";

      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Agent record retrieved", {
          agentName,
          purpose: agentRecord.purpose,
          status: agentRecord.status,
        });

      // Create agentic loop with tools
      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Creating ToolLoopAgent", {
          availableTools: ["research", "wait"],
          maxSteps: 20,
        });

      const agent = new ToolLoopAgent({
        model: gemini25(this.env.OPENROUTER_API_KEY),
        instructions: `You are the assistant of Poke by the Interaction Company of California. You are the "execution engine" of Poke, helping complete tasks for Poke, while Poke talks to the user. Your job is to execute and accomplish a goal, and you do not have direct access to the user.

Your final output is directed to Poke, which handles user conversations and presents your results to the user. Focus on providing Poke with adequate contextual information; you are not responsible for framing responses in a user-friendly way.

If you need more data from Poke or the user, include it in your final output message. If you need to send a message to the user, tell Poke to forward that message to the user.

Remember that your last output message (summary) will be forwarded to Poke. In that message, provide all relevant information and avoid preamble or postamble (e.g., "Here's what I found:" or "Let me know if this looks good"). Be concise and direct.

This conversation history may have gaps. It may start from the middle of a conversation, or it may be missing messages. The only assumption you can make is that Poke's latest message is the most recent one, and representative of Poke's current requests. Address that message directly. The other messages are just for context.

Before you call any tools, reason through why you are calling them by explaining the thought process. If it could possibly be helpful to call more than one tool at once, then do so.

Agent Name: ${agentName}
Purpose: ${agentRecord?.purpose || "task execution"}

# Available Tools
- research: Search the web for information using Exa
- wait: Pause execution for a specified number of seconds

# Guidelines
1. Analyze the instructions carefully before taking action
2. Use the appropriate tools to complete the task
3. Be thorough and accurate in your execution
4. Provide clear, concise responses about what you accomplished
5. If you encounter errors, explain what went wrong and what you tried

# Current Task
${input.taskDescription}`,
        tools: {
          research: createResearchTool(this.env.EXASEARCH_API_KEY),
          wait: createWaitTool(),
        },
        stopWhen: stepCountIs(20),
      });

      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Starting agent generation");

      const result = await agent.generate({
        messages: [
          {
            role: "user",
            content: input.taskDescription,
          },
        ],
      });

      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Agent generation completed", {
          stepsExecuted: result.steps?.length || 0,
          outputLength: result.text?.length || 0,
          usage: result.usage,
        });

      // Extract the final result
      const finalResult = {
        output: result.text,
        usage: result.usage,
        steps: result.steps?.length || 0,
      };

      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Updating agent status to completed", {
          outputPreview: result.text?.substring(0, 100),
        });

      await updateAgentStatus(db, input.agentId, "completed", {
        result: finalResult,
      });

      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Task completed successfully", {
          steps: finalResult.steps,
          totalTokens: result.usage?.totalTokens,
        });

      this.setState({ isExecuting: false });

      // Ping interaction worker with completion via RPC
      try {
        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
            result: result.text,
          })
          .info("ExecutionAgent: Pinging interaction worker with completion");

        await this.env.INTERACTION_WORKER.handleAgentCompletion({
          agentId: input.agentId,
          conversationId: input.conversationId,
          success: true,
          result: result.text,
        });

        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .info("ExecutionAgent: Successfully pinged interaction worker");
      } catch (rpcError) {
        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .error("ExecutionAgent: Failed to ping interaction worker", {
            error:
              rpcError instanceof Error ? rpcError.message : String(rpcError),
            stack: rpcError instanceof Error ? rpcError.stack : undefined,
            errorType: typeof rpcError,
          });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .error("ExecutionAgent: Task execution failed", {
          error: errorMessage,
          errorType:
            error instanceof Error ? error.constructor.name : typeof error,
          stack: errorStack,
        });

      try {
        const db = getDb(this.env.HYPERDRIVE.connectionString);

        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .info("ExecutionAgent: Updating agent status to failed");

        await updateAgentStatus(db, input.agentId, "failed", {
          errorMessage,
        });
      } catch (statusUpdateError) {
        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .error("ExecutionAgent: Failed to update agent status", {
            originalError: errorMessage,
            statusUpdateError:
              statusUpdateError instanceof Error
                ? statusUpdateError.message
                : String(statusUpdateError),
          });
      }

      this.setState({ isExecuting: false });

      // Ping interaction worker with error via RPC
      try {
        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .info("ExecutionAgent: Pinging interaction worker with error");

        await this.env.INTERACTION_WORKER.handleAgentCompletion({
          agentId: input.agentId,
          conversationId: input.conversationId,
          success: false,
          error: errorMessage,
        });

        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .info(
            "ExecutionAgent: Successfully pinged interaction worker with error",
          );
      } catch (rpcError) {
        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .error(
            "ExecutionAgent: Failed to ping interaction worker with error",
            {
              error:
                rpcError instanceof Error ? rpcError.message : String(rpcError),
              stack: rpcError instanceof Error ? rpcError.stack : undefined,
              errorType: typeof rpcError,
            },
          );
      }
    }
  }

  /**
   * Execute a task using an agentic loop with tools
   * Returns immediately and runs task in background
   */
  @callable()
  async executeTask(
    input: TaskInput,
  ): Promise<{ success: boolean; message: string }> {
    // Check if already executing to prevent concurrent runs
    if (this.state.isExecuting) {
      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .warn("ExecutionAgent: Attempted concurrent execution", {
          taskDescription: input.taskDescription.substring(0, 100),
        });

      return {
        success: false,
        message: "Agent is already executing a task",
      };
    }

    logger
      .withTags({
        agentId: input.agentId,
        conversationId: input.conversationId,
      })
      .info("ExecutionAgent: Starting task execution in background", {
        taskDescription: input.taskDescription.substring(0, 200),
        taskLength: input.taskDescription.length,
      });

    // Start execution in background
    this.ctx.waitUntil(this.executeTaskInBackground(input));

    return {
      success: true,
      message: "Task execution started in background",
    };
  }
}
