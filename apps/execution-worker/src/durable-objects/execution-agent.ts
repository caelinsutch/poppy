import { getDb, reminders } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { Agent, callable } from "agents";
import { stepCountIs, ToolLoopAgent } from "ai";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq } from "drizzle-orm";
import { gemini25 } from "../clients/ai";

// Initialize dayjs plugins for timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

import type { WorkerEnv } from "../context";
import { updateAgentStatus } from "../services/agent-manager";
import {
  createCancelReminderTool,
  createListRemindersTool,
  createSetReminderTool,
} from "../tools/reminders";
import { createResearchTool } from "../tools/research";
import { createWaitTool } from "../tools/wait";
import type { ExecutionState, ReminderPayload, TaskInput } from "../types";

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

      // Create reminder tool callbacks
      const doId = this.ctx.id.toString();

      const scheduleCallback = async (params: {
        delaySeconds: number;
        reminderId: string;
      }) => {
        logger.info("ExecutionAgent: Scheduling reminder", {
          delaySeconds: params.delaySeconds,
          reminderId: params.reminderId,
        });

        const schedule = await this.schedule(
          params.delaySeconds,
          "processReminder",
          { reminderId: params.reminderId },
        );

        // Update the reminder with the DO schedule ID
        await db
          .update(reminders)
          .set({ doScheduleId: schedule.id })
          .where(eq(reminders.id, params.reminderId));

        return schedule.id;
      };

      const saveToDbCallback = async (params: {
        taskDescription: string;
        context: Record<string, unknown>;
        scheduledAt: Date;
      }) => {
        const [reminder] = await db
          .insert(reminders)
          .values({
            executionAgentDoId: doId,
            agentId: input.agentId,
            conversationId: input.conversationId,
            taskDescription: params.taskDescription,
            context: params.context,
            scheduledAt: params.scheduledAt,
            status: "pending",
          })
          .returning();

        return reminder.id;
      };

      const listCallback = async () => {
        return db.query.reminders.findMany({
          where: and(
            eq(reminders.executionAgentDoId, doId),
            eq(reminders.status, "pending"),
          ),
          orderBy: (reminders, { asc }) => [asc(reminders.scheduledAt)],
        });
      };

      const cancelCallback = async (reminderId: string) => {
        const reminder = await db.query.reminders.findFirst({
          where: eq(reminders.id, reminderId),
        });

        if (!reminder) {
          return { success: false, message: "Reminder not found" };
        }

        if (reminder.status !== "pending") {
          return {
            success: false,
            message: `Cannot cancel reminder with status: ${reminder.status}`,
          };
        }

        // Cancel the DO schedule if it exists
        if (reminder.doScheduleId) {
          await this.cancelSchedule(reminder.doScheduleId);
        }

        // Update PostgreSQL
        await db
          .update(reminders)
          .set({ status: "cancelled" })
          .where(eq(reminders.id, reminderId));

        return { success: true, message: "Reminder cancelled" };
      };

      // Create agentic loop with tools
      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Creating ToolLoopAgent", {
          availableTools: [
            "research",
            "wait",
            "set_reminder",
            "list_reminders",
            "cancel_reminder",
          ],
          maxSteps: 20,
        });

      // Format timezone context if available
      const userTimezone = input.userTimezone ?? "America/New_York";
      const currentTimeInUserTz = dayjs()
        .tz(userTimezone)
        .format("YYYY-MM-DD HH:mm:ss");
      const currentTimeUtc = dayjs().utc().format("YYYY-MM-DD HH:mm:ss");

      // Helper to get friendly timezone name
      const getFriendlyTimezone = (tz: string): string => {
        const tzMap: Record<string, string> = {
          "America/New_York": "Eastern",
          "America/Chicago": "Central",
          "America/Denver": "Mountain",
          "America/Los_Angeles": "Pacific",
          "America/Anchorage": "Alaska",
          "Pacific/Honolulu": "Hawaii",
          "America/Phoenix": "Arizona",
        };
        return tzMap[tz] ?? tz;
      };

      const friendlyTimezone = getFriendlyTimezone(userTimezone);

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

# User Timezone Context
User's timezone: ${userTimezone} (${friendlyTimezone} time)
Current time in user's timezone: ${currentTimeInUserTz}
Current time UTC: ${currentTimeUtc}

When scheduling reminders or interpreting time-related requests:
- All times mentioned by the user should be interpreted in their timezone (${friendlyTimezone})
- When the user says "3pm", they mean 3pm ${friendlyTimezone} time
- Calculate delay_seconds relative to the current time to schedule reminders correctly
- Report scheduled times in the user's timezone for clarity

# Available Tools
- research: Search the web for information using Exa
- wait: Pause execution for a specified number of seconds
- set_reminder: Schedule a future task or reminder (min 60 seconds, max 30 days)
- list_reminders: List all pending reminders
- cancel_reminder: Cancel a pending reminder by ID

# Guidelines
1. Analyze the instructions carefully before taking action
2. Use the appropriate tools to complete the task
3. Be thorough and accurate in your execution
4. Provide clear, concise responses about what you accomplished
5. If you encounter errors, explain what went wrong and what you tried
6. Use set_reminder when the user asks to be reminded about something or when you need to follow up later

# Current Task
${input.taskDescription}`,
        tools: {
          research: createResearchTool(this.env.EXASEARCH_API_KEY),
          wait: createWaitTool(),
          set_reminder: createSetReminderTool(
            scheduleCallback,
            saveToDbCallback,
          ),
          list_reminders: createListRemindersTool(listCallback),
          cancel_reminder: createCancelReminderTool(cancelCallback),
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

  /**
   * Process a scheduled reminder
   * Called automatically by the agents library when a schedule fires
   */
  async processReminder(payload: ReminderPayload): Promise<void> {
    const { reminderId } = payload;

    logger.info("ExecutionAgent: Processing reminder", { reminderId });

    const db = getDb(this.env.HYPERDRIVE.connectionString);

    try {
      // Fetch reminder from PostgreSQL
      const reminder = await db.query.reminders.findFirst({
        where: eq(reminders.id, reminderId),
      });

      if (!reminder) {
        logger.error("ExecutionAgent: Reminder not found", { reminderId });
        return;
      }

      if (reminder.status !== "pending") {
        logger.warn("ExecutionAgent: Reminder already processed or cancelled", {
          reminderId,
          status: reminder.status,
        });
        return;
      }

      // Mark as processing
      await db
        .update(reminders)
        .set({ status: "processing", processedAt: new Date() })
        .where(eq(reminders.id, reminderId));

      // Check if agent is busy - if so, reschedule with backoff
      if (this.state.isExecuting) {
        const backoffSeconds = Math.min(60 * 2 ** reminder.retryCount, 3600); // Max 1 hour

        logger.info("ExecutionAgent: Agent busy, rescheduling reminder", {
          reminderId,
          backoffSeconds,
          retryCount: reminder.retryCount,
        });

        // Reschedule
        await this.schedule(backoffSeconds, "processReminder", {
          reminderId,
        });

        // Update reminder for retry
        await db
          .update(reminders)
          .set({
            status: "pending",
            retryCount: reminder.retryCount + 1,
            scheduledAt: new Date(Date.now() + backoffSeconds * 1000),
          })
          .where(eq(reminders.id, reminderId));

        return;
      }

      // Execute the reminder task via executeTaskInBackground
      logger.info("ExecutionAgent: Executing reminder task", {
        reminderId,
        taskDescription: reminder.taskDescription.substring(0, 100),
      });

      // Run the task in background
      this.ctx.waitUntil(
        this.executeTaskInBackground({
          agentId: reminder.agentId,
          conversationId: reminder.conversationId,
          taskDescription: `[SCHEDULED REMINDER] ${reminder.taskDescription}`,
        })
          .then(async () => {
            // Mark reminder as completed after task finishes
            await db
              .update(reminders)
              .set({ status: "completed", completedAt: new Date() })
              .where(eq(reminders.id, reminderId));

            logger.info("ExecutionAgent: Reminder completed", { reminderId });
          })
          .catch(async (error) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            await db
              .update(reminders)
              .set({
                status: "failed",
                errorMessage,
                completedAt: new Date(),
              })
              .where(eq(reminders.id, reminderId));

            logger.error("ExecutionAgent: Reminder task failed", {
              reminderId,
              error: errorMessage,
            });
          }),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error("ExecutionAgent: Failed to process reminder", {
        reminderId,
        error: errorMessage,
      });

      // Update status to failed
      await db
        .update(reminders)
        .set({
          status: "failed",
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(reminders.id, reminderId));
    }
  }
}
