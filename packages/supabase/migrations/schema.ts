import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const agentMessageType = pgEnum("agent_message_type", [
  "task_assignment",
  "status_update",
  "result",
  "error",
  "cancellation",
]);
export const agentStatus = pgEnum("agent_status", [
  "initializing",
  "active",
  "completed",
  "failed",
  "cancelled",
]);
export const agentType = pgEnum("agent_type", ["interaction", "execution"]);
export const reminderRecurrence = pgEnum("reminder_recurrence", [
  "none",
  "daily",
  "weekly",
  "weekdays",
]);
export const reminderStatus = pgEnum("reminder_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export const stepType = pgEnum("step_type", [
  "web_search",
  "check_availability",
  "parse_result",
  "llm_decision",
  "filter_options",
  "rank_results",
  "call_restaurant",
]);
export const taskStatus = pgEnum("task_status", [
  "initialized",
  "searching",
  "checking_availability",
  "completed",
  "partial_results",
  "failed",
  "no_results",
  "retrying",
  "expired",
]);

export const agents = pgTable(
  "agents",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    agentType: agentType("agent_type").notNull(),
    parentInteractionAgentId: uuid("parent_interaction_agent_id"),
    conversationId: uuid("conversation_id").notNull(),
    status: agentStatus().default("initializing").notNull(),
    purpose: text(),
    context: jsonb(),
    result: jsonb(),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { mode: "string" }),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("agents_conversation_idx").using(
      "btree",
      table.conversationId.asc().nullsLast().op("uuid_ops"),
    ),
    index("agents_parent_interaction_idx").using(
      "btree",
      table.parentInteractionAgentId.asc().nullsLast().op("uuid_ops"),
    ),
    index("agents_type_status_idx").using(
      "btree",
      table.agentType.asc().nullsLast().op("enum_ops"),
      table.status.asc().nullsLast().op("enum_ops"),
    ),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: "agents_conversation_id_conversations_id_fk",
    }),
    foreignKey({
      columns: [table.parentInteractionAgentId],
      foreignColumns: [table.id],
      name: "agents_parent_interaction_agent_id_agents_id_fk",
    }),
  ],
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    executionAgentDoId: varchar("execution_agent_do_id").notNull(),
    doScheduleId: varchar("do_schedule_id"),
    agentId: uuid("agent_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    taskDescription: text("task_description").notNull(),
    context: jsonb(),
    scheduledAt: timestamp("scheduled_at", { mode: "string" }).notNull(),
    status: reminderStatus().default("pending").notNull(),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { mode: "string" }),
    completedAt: timestamp("completed_at", { mode: "string" }),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0).notNull(),
    recurrence: reminderRecurrence().default("none").notNull(),
  },
  (table) => [
    index("reminders_agent_idx").using(
      "btree",
      table.agentId.asc().nullsLast().op("uuid_ops"),
    ),
    index("reminders_conversation_idx").using(
      "btree",
      table.conversationId.asc().nullsLast().op("uuid_ops"),
    ),
    index("reminders_do_schedule_idx").using(
      "btree",
      table.doScheduleId.asc().nullsLast().op("text_ops"),
    ),
    index("reminders_execution_agent_do_idx").using(
      "btree",
      table.executionAgentDoId.asc().nullsLast().op("text_ops"),
    ),
    index("reminders_scheduled_at_idx").using(
      "btree",
      table.scheduledAt.asc().nullsLast().op("timestamp_ops"),
    ),
    index("reminders_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("enum_ops"),
    ),
    foreignKey({
      columns: [table.agentId],
      foreignColumns: [agents.id],
      name: "reminders_agent_id_agents_id_fk",
    }),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: "reminders_conversation_id_conversations_id_fk",
    }),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: varchar().primaryKey().notNull(),
    conversationId: uuid("conversation_id").notNull(),
    userId: uuid("user_id"),
    isOutbound: boolean("is_outbound").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    fromAgentId: uuid("from_agent_id"),
    toAgentId: uuid("to_agent_id"),
    agentMessageType: agentMessageType("agent_message_type"),
  },
  (table) => [
    index("messages_conversation_idx").using(
      "btree",
      table.conversationId.asc().nullsLast().op("uuid_ops"),
    ),
    index("messages_from_agent_idx").using(
      "btree",
      table.fromAgentId.asc().nullsLast().op("uuid_ops"),
    ),
    index("messages_to_agent_idx").using(
      "btree",
      table.toAgentId.asc().nullsLast().op("uuid_ops"),
    ),
    index("messages_user_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: "messages_conversation_id_conversations_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "messages_user_id_users_id_fk",
    }),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    learnedPreferences: jsonb("learned_preferences").notNull(),
    inferredPreferences: jsonb("inferred_preferences"),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "user_preferences_user_id_users_id_fk",
    }),
    unique("user_preferences_user_id_unique").on(table.userId),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    phoneNumber: text("phone_number").notNull(),
    email: text(),
    name: text(),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    timezone: text().default("America/New_York").notNull(),
    timezoneSource: text("timezone_source").default("default").notNull(),
  },
  (table) => [unique("users_phone_number_unique").on(table.phoneNumber)],
);

export const parts = pgTable(
  "parts",
  {
    id: varchar().primaryKey().notNull(),
    messageId: varchar().notNull(),
    type: varchar().notNull(),
    content: jsonb().notNull(),
    createdAt: timestamp({ mode: "string" }).defaultNow().notNull(),
    order: integer().default(0).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.messageId],
      foreignColumns: [messages.id],
      name: "parts_messageId_messages_id_fk",
    }).onDelete("cascade"),
  ],
);

export const conversations = pgTable("conversations", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  channelType: varchar("channel_type").notNull(),
  isGroup: boolean("is_group").default(false).notNull(),
  loopMessageGroupId: varchar("loop_message_group_id"),
  sender: varchar().notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const userIntegrations = pgTable(
  "user_integrations",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    provider: text().notNull(),
    composioUserId: text("composio_user_id").notNull(),
    connectionId: text("connection_id"),
    connectionRequestId: text("connection_request_id"),
    status: text().default("pending").notNull(),
    metadata: jsonb(),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("integrations_composio_user_idx").using(
      "btree",
      table.composioUserId.asc().nullsLast().op("text_ops"),
    ),
    index("integrations_connection_idx").using(
      "btree",
      table.connectionId.asc().nullsLast().op("text_ops"),
    ),
    index("integrations_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
    ),
    index("integrations_user_provider_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
      table.provider.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "user_integrations_user_id_users_id_fk",
    }).onDelete("cascade"),
  ],
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id").notNull(),
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    index("participants_conversation_idx").using(
      "btree",
      table.conversationId.asc().nullsLast().op("uuid_ops"),
    ),
    index("participants_user_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: "conversation_participants_conversation_id_conversations_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "conversation_participants_user_id_users_id_fk",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.conversationId, table.userId],
      name: "conversation_participants_conversation_id_user_id_pk",
    }),
  ],
);
