import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId, ToolUIPart } from "ai";
import { userChannels } from './users';

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userIds: jsonb("user_ids").notNull(), // array of user ids
  channelId: uuid("channel_id").references(() => userChannels.id).notNull(),
  contextId: uuid("context_id"), // links to specific feature context
}, (table) => ({
  userIdx: index("conversation_user_idx").on(table.userIds),
}));

export const messages = pgTable("messages", {
  id: varchar()
    .primaryKey()
    .$defaultFn(() => generateId()),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  channelId: uuid("channel_id").references(() => userChannels.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
  // role: varchar().$type<MyUIMessage["role"]>().notNull(),
});

export const parts = pgTable(
  "parts",
  {
    id: varchar()
      .primaryKey()
      .$defaultFn(() => generateId()),
    messageId: varchar()
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar().$type<ToolUIPart["type"]>().notNull(),
    content: jsonb().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    order: integer().notNull().default(0),
  }
);