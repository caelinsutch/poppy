import { z } from "zod";
import { PriceRange } from "./enums";

// User preferences schema
export const LearnedPreferencesSchema = z.object({
  cuisines: z.array(z.string()),
  priceRange: z.array(PriceRange),
  typicalPartySize: z.number().positive(),
  preferredTimes: z.array(z.string()),
  avoidList: z.array(z.string()).optional(),
  favoriteRestaurants: z.array(z.string()).optional(),
});

// Inferred preferences schema
export const InferredPreferencesSchema = z.object({
  likelyPreferences: z.array(z.string()).optional(),
  behaviorPatterns: z.record(z.string(), z.any()).optional(),
  lastUpdated: z.date().optional(),
});

// Export types
export type LearnedPreferences = z.infer<typeof LearnedPreferencesSchema>;
export type InferredPreferences = z.infer<typeof InferredPreferencesSchema>;
