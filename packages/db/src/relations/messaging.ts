import { relations } from 'drizzle-orm';
import { conversations, messages, parts } from '../tables/messaging';
import { userChannels } from '../tables/users';
import { tasks } from '../tables/tasks';

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  channel: one(userChannels, {
    fields: [conversations.channelId],
    references: [userChannels.id],
  }),
  messages: many(messages),
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