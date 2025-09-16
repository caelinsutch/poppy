import { boolean, index, integer, jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { convertToModelMessages, generateId, ToolUIPart, UIMessagePart } from "ai";
import { users, userChannels } from './users';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").references(() => userChannels.id).notNull(),
  isGroup: boolean("is_group").notNull().default(false), // Explicitly mark group conversations
  loopMessageGroupId: varchar("loop_message_group_id"), // Loop Message group ID for group conversations
  sender: varchar("sender").notNull(), // The phone number we send from (our bot)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Junction table for many-to-many relationship between users and conversations
export const conversationParticipants = pgTable("conversation_participants", {
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.conversationId, table.userId] }),
  userIdx: index("participants_user_idx").on(table.userId),
  conversationIdx: index("participants_conversation_idx").on(table.conversationId),
}));

export const messages = pgTable("messages", {
  id: varchar()
    .primaryKey()
    .$defaultFn(() => generateId()),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  channelId: uuid("channel_id").references(() => userChannels.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id), // Optional if not group message
  isOutbound: boolean("is_outbound").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
}, (table) => ({
  userIdx: index("messages_user_idx").on(table.userId),
  conversationIdx: index("messages_conversation_idx").on(table.conversationId),
}));

export const parts = pgTable(
  "parts",
  {
    id: varchar()
      .primaryKey()
      .$defaultFn(() => generateId()),
    messageId: varchar()
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar().$type<UIMessagePart<any, any>["type"]>().notNull(),
    content: jsonb().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    order: integer().notNull().default(0),
  }
);

// Type exports
export type Conversation = InferSelectModel<typeof conversations>;
export type NewConversation = InferInsertModel<typeof conversations>;
export type ConversationParticipant = InferSelectModel<typeof conversationParticipants>;
export type NewConversationParticipant = InferInsertModel<typeof conversationParticipants>;
export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;
export type Part = InferSelectModel<typeof parts>;
export type NewPart = InferInsertModel<typeof parts>;