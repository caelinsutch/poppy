import type { Reminder } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { tool } from "ai";
import { z } from "zod";

/**
 * Tool for scheduling a reminder
 */
export const createSetReminderTool = (
  scheduleCallback: (params: {
    delaySeconds: number;
    reminderId: string;
  }) => Promise<string>,
  saveToDbCallback: (params: {
    taskDescription: string;
    context: Record<string, unknown>;
    scheduledAt: Date;
  }) => Promise<string>,
) => {
  return tool({
    description: `Schedule a reminder for future execution. Use this when:
- The user asks to be reminded about something
- You need to check back on something later
- A task needs to be retried after a delay
- You want to follow up with the user at a specific time

The reminder will fire after the specified delay, and you will be re-invoked with the reminder context.`,
    inputSchema: z.object({
      task_description: z
        .string()
        .describe(
          "The task description for when this reminder fires. Be specific about what action to take.",
        ),
      delay_seconds: z
        .number()
        .min(60)
        .max(86400 * 30) // Max 30 days
        .describe("Delay in seconds from now when to execute the reminder"),
      reason: z
        .string()
        .optional()
        .describe("Optional reason for setting this reminder"),
    }),
    execute: async ({ task_description, delay_seconds, reason }) => {
      logger.info("Set reminder tool called", {
        delay_seconds,
        reason,
        taskDescriptionLength: task_description.length,
      });

      const scheduledAt = new Date(Date.now() + delay_seconds * 1000);

      const context: Record<string, unknown> = {};
      if (reason) {
        context.reason = reason;
      }

      const reminderId = await saveToDbCallback({
        taskDescription: task_description,
        context,
        scheduledAt,
      });

      const doScheduleId = await scheduleCallback({
        delaySeconds: delay_seconds,
        reminderId,
      });

      logger.info("Reminder scheduled successfully", {
        reminderId,
        doScheduleId,
        scheduledAt: scheduledAt.toISOString(),
      });

      return {
        type: "reminder_scheduled" as const,
        reminderId,
        scheduledAt: scheduledAt.toISOString(),
        delaySeconds: delay_seconds,
      };
    },
  });
};

/**
 * Tool for listing pending reminders
 */
export const createListRemindersTool = (
  listCallback: () => Promise<Reminder[]>,
) => {
  return tool({
    description: `List all pending reminders for this agent. Use this to check what reminders are scheduled before setting new ones or to review upcoming tasks.`,
    inputSchema: z.object({}),
    execute: async () => {
      logger.info("List reminders tool called");

      const reminders = await listCallback();

      logger.info("List reminders completed", { count: reminders.length });

      return {
        type: "reminders_list" as const,
        reminders: reminders.map((r) => ({
          id: r.id,
          taskDescription: r.taskDescription,
          scheduledAt: r.scheduledAt.toISOString(),
          status: r.status,
          context: r.context,
        })),
        count: reminders.length,
      };
    },
  });
};

/**
 * Tool for cancelling a reminder
 */
export const createCancelReminderTool = (
  cancelCallback: (
    reminderId: string,
  ) => Promise<{ success: boolean; message: string }>,
) => {
  return tool({
    description: `Cancel a pending reminder by its ID. Use this when:
- Conditions have changed and the reminder is no longer needed
- The user asks to cancel a reminder
- You need to reschedule with different parameters (cancel then set new)`,
    inputSchema: z.object({
      reminder_id: z
        .string()
        .uuid()
        .describe("The UUID of the reminder to cancel"),
    }),
    execute: async ({ reminder_id }) => {
      logger.info("Cancel reminder tool called", { reminderId: reminder_id });

      const result = await cancelCallback(reminder_id);

      logger.info("Cancel reminder completed", {
        reminderId: reminder_id,
        success: result.success,
      });

      return {
        type: "reminder_cancelled" as const,
        reminderId: reminder_id,
        success: result.success,
        message: result.message,
      };
    },
  });
};
