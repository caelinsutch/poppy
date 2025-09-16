import { relations } from 'drizzle-orm';
import { users, userChannels, userPreferences } from '../tables/users';
import { conversations, conversationParticipants, messages } from '../tables/messaging';
import { tasks } from '../tables/tasks';
import { reservationHistory } from '../tables/restaurants';

export const usersRelations = relations(users, ({ many, one }) => ({
  channels: many(userChannels),
  tasks: many(tasks),
  preferences: one(userPreferences),
  reservationHistory: many(reservationHistory),
  conversationParticipants: many(conversationParticipants),
  messages: many(messages),
}));

export const userChannelsRelations = relations(userChannels, ({ one, many }) => ({
  user: one(users, {
    fields: [userChannels.userId],
    references: [users.id],
  }),
  conversations: many(conversations),
  messages: many(messages),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));