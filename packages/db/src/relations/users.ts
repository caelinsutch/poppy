import { relations } from "drizzle-orm";
import { conversationParticipants, messages } from "../tables/messaging";
import { tasks } from "../tables/tasks";
import { userPreferences, users } from "../tables/users";

export const usersRelations = relations(users, ({ many, one }) => ({
  tasks: many(tasks),
  preferences: one(userPreferences),
  conversationParticipants: many(conversationParticipants),
  messages: many(messages),
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
