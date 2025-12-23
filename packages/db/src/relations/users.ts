import { relations } from "drizzle-orm";
import { userGmailConnections } from "../tables/integrations";
import { conversationParticipants, messages } from "../tables/messaging";
import { userPreferences, users } from "../tables/users";

export const usersRelations = relations(users, ({ many, one }) => ({
  preferences: one(userPreferences),
  conversationParticipants: many(conversationParticipants),
  messages: many(messages),
  gmailConnections: many(userGmailConnections),
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
