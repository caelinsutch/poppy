import { relations } from "drizzle-orm/relations";
import {
  agents,
  conversationParticipants,
  conversations,
  messages,
  parts,
  reminders,
  userIntegrations,
  userPreferences,
  users,
} from "./schema";

export const agentsRelations = relations(agents, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [agents.conversationId],
    references: [conversations.id],
  }),
  agent: one(agents, {
    fields: [agents.parentInteractionAgentId],
    references: [agents.id],
    relationName: "agents_parentInteractionAgentId_agents_id",
  }),
  agents: many(agents, {
    relationName: "agents_parentInteractionAgentId_agents_id",
  }),
  reminders: many(reminders),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  agents: many(agents),
  reminders: many(reminders),
  messages: many(messages),
  conversationParticipants: many(conversationParticipants),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  agent: one(agents, {
    fields: [reminders.agentId],
    references: [agents.id],
  }),
  conversation: one(conversations, {
    fields: [reminders.conversationId],
    references: [conversations.id],
  }),
}));

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
}));

export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  userPreferences: many(userPreferences),
  userIntegrations: many(userIntegrations),
  conversationParticipants: many(conversationParticipants),
}));

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
  }),
);

export const partsRelations = relations(parts, ({ one }) => ({
  message: one(messages, {
    fields: [parts.messageId],
    references: [messages.id],
  }),
}));

export const userIntegrationsRelations = relations(
  userIntegrations,
  ({ one }) => ({
    user: one(users, {
      fields: [userIntegrations.userId],
      references: [users.id],
    }),
  }),
);

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
