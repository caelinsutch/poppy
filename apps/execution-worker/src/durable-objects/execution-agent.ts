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
  checkUserConnection,
  getComposioTools,
  getUserConnections,
} from "../tools/gmail";
import {
  createCancelReminderTool,
  createListRemindersTool,
  createSetReminderTool,
  type ReminderRecurrence,
} from "../tools/reminders";
import { createResearchTool } from "../tools/research";
import { createWaitTool } from "../tools/wait";
import type { ExecutionState, ReminderPayload, TaskInput } from "../types";

export class ExecutionAgent extends Agent<WorkerEnv, ExecutionState> {
  initialState: ExecutionState = {
    isExecuting: false,
  };

  /**
   * Build the tools object for the agent, including Gmail tools if available
   */
  private async buildTools(
    input: TaskInput,
    callbacks: {
      scheduleCallback: (params: {
        delaySeconds: number;
        reminderId: string;
      }) => Promise<string>;
      saveToDbCallback: (params: {
        taskDescription: string;
        context: Record<string, unknown>;
        scheduledAt: Date;
        recurrence: ReminderRecurrence;
      }) => Promise<string>;
      listCallback: () => Promise<any[]>;
      cancelCallback: (
        reminderId: string,
      ) => Promise<{ success: boolean; message: string }>;
    },
  ) {
    // Base tools that are always available
    const tools: Record<string, any> = {
      research: createResearchTool(this.env.EXASEARCH_API_KEY),
      wait: createWaitTool(),
      set_reminder: createSetReminderTool(
        callbacks.scheduleCallback,
        callbacks.saveToDbCallback,
      ),
      list_reminders: createListRemindersTool(callbacks.listCallback),
      cancel_reminder: createCancelReminderTool(callbacks.cancelCallback),
    };

    // Add Gmail tools if user has an active connection (check via Composio API)
    if (input.userId) {
      const gmailConnection = await checkUserConnection(
        this.env.COMPOSIO_API_KEY,
        input.userId,
        "gmail",
      );

      if (gmailConnection.connected) {
        logger.info("Loading Gmail tools for user", {
          userId: input.userId,
        });

        // Get Gmail tools from Composio using userId directly
        const gmailTools = await getComposioTools(
          this.env.COMPOSIO_API_KEY,
          input.userId,
          ["gmail"],
        );

        // Merge Gmail tools into the tools object
        Object.assign(tools, gmailTools);

        logger.info("Gmail tools loaded successfully", {
          gmailToolCount: Object.keys(gmailTools).length,
        });
      } else {
        logger.info("No active Gmail connection for user", {
          userId: input.userId,
        });
      }

      // Add Google Calendar tools if user has an active connection
      const calendarConnection = await checkUserConnection(
        this.env.COMPOSIO_API_KEY,
        input.userId,
        "googlecalendar",
      );

      if (calendarConnection.connected) {
        logger.info("Loading Calendar tools for user", {
          userId: input.userId,
        });

        // Request specific calendar tools - must use exact Composio action names
        const calendarTools = await getComposioTools(
          this.env.COMPOSIO_API_KEY,
          input.userId,
          ["googlecalendar"],
          [
            "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS",
            "GOOGLECALENDAR_CREATE_EVENT",
            "GOOGLECALENDAR_UPDATE_EVENT",
            "GOOGLECALENDAR_DELETE_EVENT",
            "GOOGLECALENDAR_FIND_FREE_SLOTS",
            "GOOGLECALENDAR_QUICK_ADD",
          ],
        );

        Object.assign(tools, calendarTools);

        logger.info("Calendar tools loaded successfully", {
          calendarToolCount: Object.keys(calendarTools).length,
        });
      } else {
        logger.info("No active Calendar connection for user", {
          userId: input.userId,
        });
      }
    }

    return tools;
  }

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
        recurrence: ReminderRecurrence;
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
            recurrence: params.recurrence,
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

      // Build tools (includes Gmail tools if user has active connection)
      const tools = await this.buildTools(input, {
        scheduleCallback,
        saveToDbCallback,
        listCallback,
        cancelCallback,
      });

      // Create agentic loop with tools
      logger
        .withTags({
          agentId: input.agentId,
          conversationId: input.conversationId,
        })
        .info("ExecutionAgent: Creating ToolLoopAgent", {
          availableTools: Object.keys(tools),
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

      // Fetch user's active integrations from Composio API
      let integrationsContext = "";
      if (input.userId) {
        const activeConnections = await getUserConnections(
          this.env.COMPOSIO_API_KEY,
          input.userId,
        );

        if (activeConnections.length > 0) {
          const integrationsList = activeConnections.map((conn) => {
            switch (conn.app.toLowerCase()) {
              case "gmail":
                return `- Gmail: Can send/read emails, search inbox, manage drafts`;
              case "slack":
                return `- Slack: Can send messages, read channels`;
              case "googlecalendar":
              case "calendar":
                return `- Calendar: Can create/read events, check availability`;
              default:
                return `- ${conn.app}: Connected`;
            }
          });

          integrationsContext = `
# User's Connected Integrations
The user has the following integrations connected. You have tools available to interact with these services:
${integrationsList.join("\n")}
`;
        } else {
          integrationsContext = `
# User's Connected Integrations
No integrations are currently connected for this user.
`;
        }
      }

      const agent = new ToolLoopAgent({
        model: gemini25(this.env.OPENROUTER_API_KEY),
        instructions: `You are the execution engine of Poppy. Your job is to TAKE ACTION and accomplish tasks, not ask questions.

# Core Principle: ACTION OVER CLARIFICATION
- NEVER ask clarifying questions. Just take action with sensible defaults.
- Asking for clarification creates a terrible user experience (multi-hop delays).
- If something is ambiguous, make a reasonable assumption and proceed.
- You can always provide more context in your response about what you assumed.

# Sensible Defaults (use these instead of asking)
- "recent emails" or "check inbox" → fetch the 5 most recent emails
- "search emails" without query → fetch recent emails instead
- Ambiguous time references → use reasonable interpretation based on context

# Asking Clarifying Questions
If you truly cannot proceed without more information (rare):
- Include your question clearly in your output
- Poppy will ask the user and send you a follow-up task
- Only ask when you genuinely cannot make a reasonable assumption

Example situations where asking is OK:
- "Send an email" but no recipient → "I need to know who to send this email to."
- Multiple accounts and no way to guess → "Which account should I use: X or Y?"

Example situations where you should NOT ask:
- "Check my inbox" → just fetch the 5 most recent emails
- "Send email to John" when you have John's email → just send it

# Output Format
Your output goes to Poppy, who relays it to the user. Be concise and direct:
- Just provide the results or information
- No preamble ("Here's what I found:")
- No postamble ("Let me know if you need anything else")
- State what you did and what you found

Agent Name: ${agentName}
Purpose: ${agentRecord?.purpose || "task execution"}
${integrationsContext}
# User Timezone Context
User's timezone: ${userTimezone} (${friendlyTimezone} time)
Current time in user's timezone: ${currentTimeInUserTz}
Current time UTC: ${currentTimeUtc}

When scheduling reminders or interpreting time-related requests:
- All times mentioned by the user should be interpreted in their timezone (${friendlyTimezone})
- When the user says "3pm", they mean 3pm ${friendlyTimezone} time
- If the user doesn't specify a time (e.g., "remind me tomorrow to call mom"), default to 10:00 AM in their timezone
- If the user says "tomorrow" or a specific date without time, use 10:00 AM as the default time
- Calculate delay_seconds by computing the difference between the target time and the current time (${currentTimeInUserTz})
- For example, if it's currently 2:00 PM and the user wants a reminder at 3:00 PM, delay_seconds = 3600 (1 hour)
- For "tomorrow at 10am": calculate the number of seconds from now until 10:00 AM tomorrow in ${friendlyTimezone} time
- Report scheduled times in the user's timezone for clarity
- IMPORTANT: Always double-check your delay_seconds calculation to ensure the reminder fires at the correct time

# Available Tools
- research: Search the web for information using Exa
- wait: Pause execution for a specified number of seconds
- set_reminder: Schedule a future task or reminder (min 60 seconds, max 30 days)
- list_reminders: List all pending reminders
- cancel_reminder: Cancel a pending reminder by ID

# Handling Scheduled Reminders
When your task starts with "[SCHEDULED REMINDER]", this means a previously scheduled reminder has FIRED. You should:
1. Simply tell Poppy to notify the user about this reminder
2. Do NOT try to set a new reminder unless the user explicitly asks for it
3. Do NOT ask clarifying questions - just deliver the reminder message
4. Your output should just say what the reminder was about (e.g., "Tell the user: Pay off your J.Crew card!")

Example:
- Task: "[SCHEDULED REMINDER] Pay off Jcrew card"
- Correct response: "Tell the user: Pay off your J.Crew card!"
- WRONG response: "I need to set a reminder for..." or "When should I remind them?"

# Guidelines
1. TAKE ACTION IMMEDIATELY - don't ask for clarification
2. Use sensible defaults when details are missing
3. If you encounter errors, explain what went wrong briefly
4. For reminders: use set_reminder, default to 10 AM if no time given
5. For [SCHEDULED REMINDER] tasks: just deliver the notification, don't set new reminders

# Current Task
${input.taskDescription}`,
        tools,
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

      // Check for tool errors in the result steps
      const toolErrors: Array<{ toolName: string; error: string }> = [];
      if (result.steps && result.steps.length > 0) {
        for (const step of result.steps) {
          if (step.content && Array.isArray(step.content)) {
            for (const item of step.content) {
              if (item.type === "tool-error") {
                toolErrors.push({
                  toolName: (item as any).toolName || "unknown",
                  error: (item as any).error || "Unknown error",
                });
              }
            }
          }
        }
      }

      // If there were tool errors, treat this as a failed task
      if (toolErrors.length > 0) {
        const errorMessages = toolErrors
          .map((e) => `${e.toolName}: ${e.error}`)
          .join("; ");

        logger
          .withTags({
            agentId: input.agentId,
            conversationId: input.conversationId,
          })
          .warn("ExecutionAgent: Tool errors detected in result", {
            toolErrors,
            outputPreview: result.text?.substring(0, 200),
          });

        // Use the agent's text response if available (it may have summarized the error),
        // otherwise use the raw error messages
        const errorMessage =
          result.text || `Tool errors occurred: ${errorMessages}`;

        await updateAgentStatus(db, input.agentId, "failed", {
          errorMessage,
        });

        this.setState({ isExecuting: false });

        // Ping interaction worker with error
        try {
          await this.env.INTERACTION_WORKER.handleAgentCompletion({
            agentId: input.agentId,
            conversationId: input.conversationId,
            success: false,
            error: errorMessage,
          });
        } catch (rpcError) {
          logger
            .withTags({
              agentId: input.agentId,
              conversationId: input.conversationId,
            })
            .error(
              "ExecutionAgent: Failed to ping interaction worker with tool error",
              {
                error:
                  rpcError instanceof Error
                    ? rpcError.message
                    : String(rpcError),
              },
            );
        }
        return;
      }

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
   * Calculate next scheduled time for recurring reminders
   */
  private calculateNextOccurrence(
    recurrence: ReminderRecurrence,
    currentScheduledAt: Date,
  ): Date | null {
    if (recurrence === "none") return null;

    const next = dayjs(currentScheduledAt);

    switch (recurrence) {
      case "daily":
        return next.add(1, "day").toDate();

      case "weekly":
        return next.add(1, "week").toDate();

      case "weekdays": {
        let nextDate = next.add(1, "day");
        while (nextDate.day() === 0 || nextDate.day() === 6) {
          nextDate = nextDate.add(1, "day");
        }
        return nextDate.toDate();
      }

      default:
        return null;
    }
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

            const recurrence =
              (reminder.recurrence as ReminderRecurrence) || "none";
            const nextScheduledAt = this.calculateNextOccurrence(
              recurrence,
              reminder.scheduledAt,
            );

            if (nextScheduledAt) {
              const delaySeconds = Math.max(
                60,
                Math.floor((nextScheduledAt.getTime() - Date.now()) / 1000),
              );

              const [newReminder] = await db
                .insert(reminders)
                .values({
                  executionAgentDoId: this.ctx.id.toString(),
                  agentId: reminder.agentId,
                  conversationId: reminder.conversationId,
                  taskDescription: reminder.taskDescription,
                  context: reminder.context as Record<string, unknown>,
                  scheduledAt: nextScheduledAt,
                  status: "pending",
                  recurrence,
                })
                .returning();

              const schedule = await this.schedule(
                delaySeconds,
                "processReminder",
                { reminderId: newReminder.id },
              );

              await db
                .update(reminders)
                .set({ doScheduleId: schedule.id })
                .where(eq(reminders.id, newReminder.id));

              logger.info("ExecutionAgent: Scheduled next recurring reminder", {
                originalReminderId: reminderId,
                newReminderId: newReminder.id,
                recurrence,
                nextScheduledAt: nextScheduledAt.toISOString(),
              });
            }
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
