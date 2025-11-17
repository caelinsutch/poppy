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
   * Execute a task using an agentic loop with tools
   */
  @callable()
  async executeTask(
    input: TaskInput,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    // Check if already executing to prevent concurrent runs
    if (this.state.isExecuting) {
      return {
        success: false,
        error: "Agent is already executing a task",
      };
    }

    this.setState({ isExecuting: true });

    logger
      .withTags({
        agentId: input.agentId,
        conversationId: input.conversationId,
      })
      .info("ExecutionAgent: Starting task execution", {
        taskDescription: input.taskDescription,
      });

    try {
      const db = getDb(this.env.HYPERDRIVE.connectionString);
      await updateAgentStatus(db, input.agentId, "active");

      // Get agent details from database
      const agentRecord = await db.query.agents.findFirst({
        where: (agents, { eq }) => eq(agents.id, input.agentId),
      });

      const agentName = agentRecord?.purpose || "execution_agent";

      // Create agentic loop with tools
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

      const result = await agent.generate({
        messages: [
          {
            role: "user",
            content: input.taskDescription,
          },
        ],
      });

      // Extract the final result
      const finalResult = {
        output: result.text,
        usage: result.usage,
        steps: result.steps?.length || 0,
      };

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
        });

      this.setState({ isExecuting: false });
      return { success: true, result: finalResult };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const db = getDb(this.env.HYPERDRIVE.connectionString);
      await updateAgentStatus(db, input.agentId, "failed", { errorMessage });

      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .error("ExecutionAgent: Task execution failed", {
          error: errorMessage,
        });

      this.setState({ isExecuting: false });
      return { success: false, error: errorMessage };
    }
  }
}
