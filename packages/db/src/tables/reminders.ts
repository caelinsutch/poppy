import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { reminderStatusEnum } from "./enums";
import { conversations } from "./messaging";

// Reminders scheduled by execution agents
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Association with execution agent DO
    executionAgentDoId: varchar("execution_agent_do_id").notNull(),

    // DO schedule ID returned by this.schedule()
    doScheduleId: varchar("do_schedule_id"),

    // Context - which agent and conversation this reminder belongs to
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id)
      .notNull(),

    // Reminder content - the task description for when the reminder fires
    taskDescription: text("task_description").notNull(),

    // Additional context stored as JSON (reason, original task, etc.)
    context: jsonb("context"),

    // Scheduling
    scheduledAt: timestamp("scheduled_at").notNull(),

    // Status tracking
    status: reminderStatusEnum("status").notNull().default("pending"),

    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
    completedAt: timestamp("completed_at"),

    // Error tracking
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
  },
  (table) => ({
    agentIdx: index("reminders_agent_idx").on(table.agentId),
    conversationIdx: index("reminders_conversation_idx").on(
      table.conversationId,
    ),
    statusIdx: index("reminders_status_idx").on(table.status),
    scheduledAtIdx: index("reminders_scheduled_at_idx").on(table.scheduledAt),
    doScheduleIdx: index("reminders_do_schedule_idx").on(table.doScheduleId),
    executionAgentDoIdx: index("reminders_execution_agent_do_idx").on(
      table.executionAgentDoId,
    ),
  }),
);

// Type exports
export type Reminder = InferSelectModel<typeof reminders>;
export type NewReminder = InferInsertModel<typeof reminders>;
