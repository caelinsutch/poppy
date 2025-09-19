import { z } from "zod";

// Task related enums
export const TaskStatus = z.enum([
  "initialized",
  "searching",
  "checking_availability",
  "completed",
  "partial_results",
  "failed",
  "no_results",
  "retrying",
  "expired",
]);

export const TaskType = z.enum([
  "find_reservations",
  "modify_reservation",
  "cancel_reservation",
]);

export const StepType = z.enum([
  "web_search",
  "check_availability",
  "parse_result",
  "llm_decision",
  "filter_options",
  "rank_results",
  "call_restaurant",
]);

// Restaurant related enums
export const PriceRange = z.enum(["$", "$$", "$$$", "$$$$"]);

export const TableType = z.enum(["indoor", "outdoor", "bar", "private"]);

export const ConfirmationType = z.enum(["immediate", "request", "waitlist"]);

export const BookingPlatform = z.enum([
  "opentable",
  "resy",
  "yelp",
  "direct",
  "other",
]);

export const TimeFlexibility = z.enum(["exact", "30min", "1hour", "2hours"]);

// Conversation related enums
export const ConversationRole = z.enum(["user", "assistant"]);

// Export types
export type TaskStatus = z.infer<typeof TaskStatus>;
export type TaskType = z.infer<typeof TaskType>;
export type StepType = z.infer<typeof StepType>;
export type PriceRange = z.infer<typeof PriceRange>;
export type TableType = z.infer<typeof TableType>;
export type ConfirmationType = z.infer<typeof ConfirmationType>;
export type BookingPlatform = z.infer<typeof BookingPlatform>;
export type TimeFlexibility = z.infer<typeof TimeFlexibility>;
export type ConversationRole = z.infer<typeof ConversationRole>;
