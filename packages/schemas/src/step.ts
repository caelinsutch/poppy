import { z } from 'zod';
import { StepType } from './enums';
import { RestaurantSchema } from './restaurant';

// Step input schemas (discriminated unions based on step type)
export const WebSearchInputSchema = z.object({
  type: z.literal('web_search'),
  query: z.string(),
  location: z.string().optional(),
});

export const CheckAvailabilityInputSchema = z.object({
  type: z.literal('check_availability'),
  restaurant: RestaurantSchema,
  date: z.string(),
  time: z.string(),
  partySize: z.number(),
  platform: z.string(),
});

export const ParseResultInputSchema = z.object({
  type: z.literal('parse_result'),
  rawData: z.string(),
  format: z.string().optional(),
});

export const LLMDecisionInputSchema = z.object({
  type: z.literal('llm_decision'),
  prompt: z.string(),
  context: z.record(z.string(), z.any()).optional(),
});

export const FilterOptionsInputSchema = z.object({
  type: z.literal('filter_options'),
  options: z.array(z.any()),
  criteria: z.record(z.string(), z.any()),
});

export const RankResultsInputSchema = z.object({
  type: z.literal('rank_results'),
  results: z.array(z.any()),
  preferences: z.record(z.string(), z.any()).optional(),
});

export const CallRestaurantInputSchema = z.object({
  type: z.literal('call_restaurant'),
  phoneNumber: z.string(),
  script: z.string().optional(),
});

// Union of all step input types
export const StepInputSchema = z.discriminatedUnion('type', [
  WebSearchInputSchema,
  CheckAvailabilityInputSchema,
  ParseResultInputSchema,
  LLMDecisionInputSchema,
  FilterOptionsInputSchema, 
  RankResultsInputSchema,
  CallRestaurantInputSchema,
]);

// Step output schemas
export const WebSearchOutputSchema = z.object({
  type: z.literal('web_search'),
  results: z.array(z.object({
    name: z.string(),
    url: z.string().optional(),
    snippet: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })),
  totalResults: z.number(),
});

export const CheckAvailabilityOutputSchema = z.object({
  type: z.literal('check_availability'),
  available: z.boolean(),
  times: z.array(z.string()).optional(),
  message: z.string().optional(),
});

export const ParseResultOutputSchema = z.object({
  type: z.literal('parse_result'),
  parsed: z.any(),
  errors: z.array(z.string()).optional(),
});

export const LLMDecisionOutputSchema = z.object({
  type: z.literal('llm_decision'),
  decision: z.string(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const FilterOptionsOutputSchema = z.object({
  type: z.literal('filter_options'),
  filtered: z.array(z.any()),
  removedCount: z.number(),
});

export const RankResultsOutputSchema = z.object({
  type: z.literal('rank_results'),
  ranked: z.array(z.any()),
  scores: z.record(z.string(), z.number()).optional(),
});

export const CallRestaurantOutputSchema = z.object({
  type: z.literal('call_restaurant'),
  success: z.boolean(),
  notes: z.string().optional(),
  reservationConfirmed: z.boolean().optional(),
});

// Union of all step output types
export const StepOutputSchema = z.discriminatedUnion('type', [
  WebSearchOutputSchema,
  CheckAvailabilityOutputSchema,
  ParseResultOutputSchema,
  LLMDecisionOutputSchema,
  FilterOptionsOutputSchema,
  RankResultsOutputSchema,
  CallRestaurantOutputSchema,
]);

// Export types
export type StepInput = z.infer<typeof StepInputSchema>;
export type StepOutput = z.infer<typeof StepOutputSchema>;
export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;
export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;
export type CheckAvailabilityInput = z.infer<typeof CheckAvailabilityInputSchema>;
export type CheckAvailabilityOutput = z.infer<typeof CheckAvailabilityOutputSchema>;