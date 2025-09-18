import { z } from 'zod';
import { TaskType, PriceRange, TimeFlexibility, ConversationRole } from './enums';
import { ReservationOptionSchema } from './restaurant';

// Task type-specific input params (discriminated union)
export const FindReservationsInputSchema = z.object({
  type: z.literal('find_reservations'),
  // Date can be: specific date (YYYY-MM-DD), natural language ("this weekend", "tomorrow"), or relative ("next Friday")
  date: z.string().optional(),
  // Date range for flexible searches
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  // Time can be: specific time (HH:MM), natural language ("lunch", "dinner"), or relative ("evening")
  time: z.string().optional(),
  // Time range for more flexibility
  timeRange: z.object({
    earliest: z.string(),
    latest: z.string(),
  }).optional(),
  timeFlexibility: TimeFlexibility.optional(),
  partySize: z.number().positive(),
  cuisine: z.string().optional(),
  location: z.string(),
  radius: z.number().optional(), // in miles
  priceRange: z.array(PriceRange).optional(),
  preferences: z.array(z.string()).optional(),
  accessibility: z.boolean().optional(),
  // Natural language query for fallback/additional context
  naturalQuery: z.string().optional(),
}).refine(
  (data) => data.date || data.dateRange,
  { message: "Either date or dateRange must be provided" }
);
// Union of all task input types
export const TaskInputParamsSchema = z.discriminatedUnion('type', [
  FindReservationsInputSchema,
]);

// Task metadata schema
export const TaskMetadataSchema = z.object({
  retryCount: z.number().default(0),
  parallelAgents: z.array(z.object({
    agentId: z.string(),
    status: z.string(),
    startTime: z.date(),
  })).optional(),
  performanceMetrics: z.object({
    totalDuration: z.number(),
    llmCalls: z.number(),
    apiCalls: z.number(),
  }).optional(),
});

// Final options schema
export const FinalOptionsSchema = z.object({
  type: z.literal('find_reservations'),
  options: z.array(ReservationOptionSchema),
  searchSummary: z.object({
    totalSearched: z.number(),
    totalAvailable: z.number(),
    searchCriteria: z.record(z.string(), z.any()),
    searchDuration: z.number().optional(), // in seconds
  }),
});

// Export types
export type FindReservationsInput = z.infer<typeof FindReservationsInputSchema>;
export type TaskInputParams = z.infer<typeof TaskInputParamsSchema>;
export type TaskMetadata = z.infer<typeof TaskMetadataSchema>;
export type FinalOptions = z.infer<typeof FinalOptionsSchema>;