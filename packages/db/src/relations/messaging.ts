import { relations } from 'drizzle-orm';
import { conversations, conversationParticipants, messages, parts } from '../tables/messaging';
import { users, userChannels } from '../tables/users';
import { tasks } from '../tables/tasks';

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  channel: one(userChannels, {
    fields: [conversations.channelId],
    references: [userChannels.id],
  }),
  messages: many(messages),
  participants: many(conversationParticipants),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationParticipants.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  channel: one(userChannels, {
    fields: [messages.channelId],
    references: [userChannels.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  parts: many(parts),
  triggeredTasks: many(tasks, { relationName: 'triggerMessage' }),
  completedTasks: many(tasks, { relationName: 'completionMessage' }),
}));

export const partsRelations = relations(parts, ({ one }) => ({
  message: one(messages, {
    fields: [parts.messageId],
    references: [messages.id],
  }),
}));