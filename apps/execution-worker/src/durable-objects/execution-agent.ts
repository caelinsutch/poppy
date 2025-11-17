import { getDb } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { Agent, callable } from "agents";
import { stepCountIs, ToolLoopAgent } from "ai";
import { gemini25 } from "../clients/ai";
import type { WorkerEnv } from "../context";
import { updateAgentStatus } from "../services/agent-manager";
import { createResearchTool } from "../tools/research";
import { createWaitTool } from "../tools/wait";
import type { ExecutionState, TaskInput, Trigger } from "../types";

export class ExecutionAgent extends Agent<WorkerEnv, ExecutionState> {
  initialState: ExecutionState = {
    agentId: "",
    taskDescription: "",
    status: "pending",
    result: null,
    triggers: [],
  };

  /**
   * Execute a task using an agentic loop with tools
   */
  @callable()
  async executeTask(
    input: TaskInput,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    logger
      .withTags({
        agentId: input.agentId,
        conversationId: input.conversationId,
      })
      .info("ExecutionAgent: Starting task execution", {
        taskDescription: input.taskDescription,
      });

    this.setState({
      agentId: input.agentId,
      taskDescription: input.taskDescription,
      status: "running",
      result: null,
      triggers: this.state.triggers,
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

      this.setState({
        ...this.state,
        status: "completed",
        result: finalResult,
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
        });

      return { success: true, result: finalResult };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.setState({
        ...this.state,
        status: "failed",
        result: { error: errorMessage },
      });

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

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create a trigger for scheduled execution
   */
  @callable()
  async createTrigger(trigger: {
    payload: string;
    startTime: string; // ISO 8601
    rrule?: string; // iCalendar RRULE for recurrence
  }): Promise<{ success: boolean; trigger?: Trigger; error?: string }> {
    logger.info("ExecutionAgent: Creating trigger", {
      startTime: trigger.startTime,
      hasRrule: !!trigger.rrule,
    });

    try {
      const newTrigger: Trigger = {
        id: crypto.randomUUID(),
        agentId: this.state.agentId,
        payload: trigger.payload,
        startTime: trigger.startTime,
        rrule: trigger.rrule,
        status: "active",
        createdAt: new Date().toISOString(),
      };

      this.setState({
        ...this.state,
        triggers: [...this.state.triggers, newTrigger],
      });

      logger.info("ExecutionAgent: Trigger created successfully", {
        triggerId: newTrigger.id,
      });

      return { success: true, trigger: newTrigger };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("ExecutionAgent: Failed to create trigger", {
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Update an existing trigger
   */
  @callable()
  async updateTrigger(
    triggerId: string,
    updates: Partial<Pick<Trigger, "status" | "startTime" | "rrule">>,
  ): Promise<{ success: boolean; trigger?: Trigger; error?: string }> {
    logger.info("ExecutionAgent: Updating trigger", {
      triggerId,
      updates,
    });

    try {
      const triggerIndex = this.state.triggers.findIndex(
        (t) => t.id === triggerId,
      );
      if (triggerIndex === -1) {
        return { success: false, error: "Trigger not found" };
      }

      const updatedTriggers = [...this.state.triggers];
      updatedTriggers[triggerIndex] = {
        ...updatedTriggers[triggerIndex],
        ...updates,
      };

      this.setState({
        ...this.state,
        triggers: updatedTriggers,
      });

      logger.info("ExecutionAgent: Trigger updated successfully", {
        triggerId,
      });

      return { success: true, trigger: updatedTriggers[triggerIndex] };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("ExecutionAgent: Failed to update trigger", {
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * List all triggers for this agent
   */
  @callable()
  async listTriggers(): Promise<Trigger[]> {
    return this.state.triggers;
  }

  /**
   * Get current execution status
   */
  @callable()
  async getStatus(): Promise<ExecutionState> {
    return this.state;
  }

  /**
   * Triggered by cron worker to execute scheduled tasks
   */
  @callable()
  async executeTrigger(
    triggerId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const trigger = this.state.triggers.find((t) => t.id === triggerId);
    if (!trigger) {
      return { success: false, error: "Trigger not found" };
    }

    if (trigger.status !== "active") {
      return { success: false, error: "Trigger is not active" };
    }

    logger.info("ExecutionAgent: Executing trigger", {
      triggerId,
      payload: trigger.payload,
    });

    // Execute the task with the trigger payload
    return await this.executeTask({
      agentId: this.state.agentId,
      taskDescription: trigger.payload,
      conversationId: "", // Will need to pass this through trigger
    });
  }
}
