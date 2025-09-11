import { pgTable, uuid, varchar, jsonb, timestamp, integer, text } from 'drizzle-orm/pg-core';
import { users } from './users';
import { tasks } from './tasks';
import type {
  Location,
  RestaurantMetadata,
  Restaurant
} from '@poppy/schemas';

export const restaurantCache = pgTable('restaurant_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  location: jsonb('location').notNull().$type<Location>(),
  metadata: jsonb('metadata').$type<RestaurantMetadata>(),
  lastSearched: timestamp('last_searched').notNull().defaultNow(),
  ttlHours: integer('ttl_hours').notNull().default(24),
});

export const reservationHistory = pgTable('reservation_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  taskId: uuid('task_id').references(() => tasks.id),
  
  restaurant: jsonb('restaurant').notNull().$type<Restaurant>(),
  reservationDate: timestamp('reservation_date').notNull(),
  partySize: integer('party_size').notNull(),
  
  // Outcome tracking
  status: varchar('status', { length: 50 }).notNull(), // 'confirmed', 'cancelled', 'no_show'
  rating: integer('rating'), // 1-5 post-dining rating
  notes: text('notes'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
});