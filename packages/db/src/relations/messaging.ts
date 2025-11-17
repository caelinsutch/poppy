import { relations } from "drizzle-orm";
import { agents } from "../tables/agents";
import {
  conversationParticipants,
  conversations,
  messages,
  parts,
} from "../tables/messaging";
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
  fromAgent: one(agents, {
    fields: [messages.fromAgentId],
    references: [agents.id],
    relationName: "fromAgent",
  }),
  toAgent: one(agents, {
    fields: [messages.toAgentId],
    references: [agents.id],
    relationName: "toAgent",
  }),
  parts: many(parts),
}));

export const partsRelations = relations(parts, ({ one }) => ({
  message: one(messages, {
    fields: [parts.messageId],
    references: [messages.id],
  }),
}));
