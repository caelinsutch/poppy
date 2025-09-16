import { boolean, index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { convertToModelMessages, generateId, ToolUIPart, UIMessagePart } from "ai";
import { userChannels } from './users';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userIds: jsonb("user_ids").notNull(), // array of user ids
  channelId: uuid("channel_id").references(() => userChannels.id).notNull(),
}, (table) => ({
  userIdx: index("conversation_user_idx").on(table.userIds),
}));

export const messages = pgTable("messages", {
  id: varchar()
    .primaryKey()
    .$defaultFn(() => generateId()),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  channelId: uuid("channel_id").references(() => userChannels.id, { onDelete: "cascade" }).notNull(),
  sender: varchar("sender"), // Phone number or identifier of the sender (for SMS channels)
  recipient: varchar("recipient"), // Phone number or identifier of the recipient (for SMS channels)
  isOutbound: boolean("is_outbound").notNull().default(false),
  createdAt: timestamp().defaultNow().notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
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
    type: varchar().$type<UIMessagePart<any, any>["type"]>().notNull(),
    content: jsonb().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    order: integer().notNull().default(0),
  }
);

// Type exports
export type Conversation = InferSelectModel<typeof conversations>;
export type NewConversation = InferInsertModel<typeof conversations>;
export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;
export type Part = InferSelectModel<typeof parts>;
export type NewPart = InferInsertModel<typeof parts>;