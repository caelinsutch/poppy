import { relations } from "drizzle-orm";
import {
  conversationParticipants,
  conversations,
  messages,
  parts,
} from "../tables/messaging";
import { taskEvents } from "../tables/tasks";
import { users } from "../tables/users";

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  participants: many(conversationParticipants),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationParticipants.userId],
      references: [users.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  parts: many(parts),
  triggeredEvents: many(taskEvents, { relationName: "triggerMessage" }),
  responseEvents: many(taskEvents, { relationName: "responseMessage" }),
}));

export const partsRelations = relations(parts, ({ one }) => ({
  message: one(messages, {
    fields: [parts.messageId],
    references: [messages.id],
  }),
}));
