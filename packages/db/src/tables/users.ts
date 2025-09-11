import { pgTable, text, timestamp, uuid, jsonb, integer } from 'drizzle-orm/pg-core';
import { channelTypeEnum } from './enums';
import { LearnedPreferences, InferredPreferences } from '@poppy/schemas';

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phoneNumber: text("phone_number").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
});

export const userChannels = pgTable("user_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  channelType: channelTypeEnum("channel_type").notNull(),
  channelIdentifier: text("channel_identifier").notNull(), // phone number, email, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  
  // Explicitly learned/confirmed preferences
  learnedPreferences: jsonb('learned_preferences').notNull().$type<LearnedPreferences>(),
  
  // Inferred preferences (from behavior)
  inferredPreferences: jsonb('inferred_preferences').$type<InferredPreferences>(),
  
  // Stats
  totalReservations: integer('total_reservations').notNull().default(0),
  lastReservationAt: timestamp('last_reservation_at'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});