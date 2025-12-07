import type { InferredPreferences, LearnedPreferences } from "@poppy/schemas";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phoneNumber: text("phone_number").notNull().unique(),
  email: text("email"),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  // How the timezone was determined: "default" (system default), "inferred" (from area code), "confirmed" (user confirmed)
  timezoneSource: text("timezone_source").notNull().default("default"),
});

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),

  // Explicitly learned/confirmed preferences
  learnedPreferences: jsonb("learned_preferences")
    .notNull()
    .$type<LearnedPreferences>(),

  // Inferred preferences (from behavior)
  inferredPreferences: jsonb(
    "inferred_preferences",
  ).$type<InferredPreferences>(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Type exports
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserPreference = InferSelectModel<typeof userPreferences>;
export type NewUserPreference = InferInsertModel<typeof userPreferences>;
