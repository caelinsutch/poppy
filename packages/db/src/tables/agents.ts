import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agentStatusEnum, agentTypeEnum } from "./enums";
import { conversations } from "./messaging";
import { taskRuns, tasks } from "./tasks";

// Core agent instances
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Agent classification
    agentType: agentTypeEnum("agent_type").notNull(),

    // For execution agents: link to parent interaction agent (flat hierarchy)
    parentInteractionAgentId: uuid("parent_interaction_agent_id").references(
      (): AnyPgColumn => agents.id,
    ),

    // Context associations
    conversationId: uuid("conversation_id")
      .references(() => conversations.id)
      .notNull(), // Both types link to conversation
    taskId: uuid("task_id").references(() => tasks.id), // For execution agents
    taskRunId: uuid("task_run_id").references(() => taskRuns.id),

    // Agent state
    status: agentStatusEnum("status").notNull().default("initializing"),
    purpose: text("purpose"), // What this agent is doing
    context: jsonb("context"), // Agent-specific state
    result: jsonb("result"), // Final output

    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),

    // Error tracking
    errorMessage: text("error_message"),
  },
  (table) => ({
    parentIdx: index("agents_parent_interaction_idx").on(
      table.parentInteractionAgentId,
    ),
    conversationIdx: index("agents_conversation_idx").on(table.conversationId),
    typeStatusIdx: index("agents_type_status_idx").on(
      table.agentType,
      table.status,
    ),
  }),
);

// Type exports
export type Agent = InferSelectModel<typeof agents>;
export type NewAgent = InferInsertModel<typeof agents>;
