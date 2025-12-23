import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Stores Gmail connections via Composio
 * Each user can have one active Gmail connection at a time
 */
export const userGmailConnections = pgTable(
  "user_gmail_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The user ID used with Composio (can be same as userId or a custom mapping)
    composioUserId: text("composio_user_id").notNull(),
    // The connection ID returned from Composio after OAuth
    connectionId: text("connection_id"),
    // Connection request ID (used during pending state)
    connectionRequestId: text("connection_request_id"),
    // Connection status: pending, active, disconnected, failed
    status: text("status").notNull().default("pending"),
    // The Gmail email address once connected
    email: text("email"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("gmail_connections_user_idx").on(table.userId),
    composioUserIdx: index("gmail_connections_composio_user_idx").on(
      table.composioUserId,
    ),
    statusIdx: index("gmail_connections_status_idx").on(table.status),
  }),
);

// Type exports
export type UserGmailConnection = InferSelectModel<typeof userGmailConnections>;
export type NewUserGmailConnection = InferInsertModel<
  typeof userGmailConnections
>;
