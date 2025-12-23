import { relations } from "drizzle-orm";
import { userGmailConnections } from "../tables/integrations";
import { users } from "../tables/users";

export const userGmailConnectionsRelations = relations(
  userGmailConnections,
  ({ one }) => ({
    user: one(users, {
      fields: [userGmailConnections.userId],
      references: [users.id],
    }),
  }),
);
