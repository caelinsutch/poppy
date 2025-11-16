import { pgEnum } from "drizzle-orm/pg-core";

export const taskStatusEnum = pgEnum("task_status", [
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

export const taskTypeEnum = pgEnum("task_type", [
  "find_reservations",
  "modify_reservation",
  "cancel_reservation",
]);

export const stepTypeEnum = pgEnum("step_type", [
  "web_search",
  "check_availability",
  "parse_result",
  "llm_decision",
  "filter_options",
  "rank_results",
  "call_restaurant",
]);

export const agentTypeEnum = pgEnum("agent_type", [
  "interaction", // Main conversation handler
  "execution", // Task-specific agents (flat, no nesting)
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "initializing",
  "active",
  "completed",
  "failed",
  "cancelled",
]);

export const agentMessageTypeEnum = pgEnum("agent_message_type", [
  "task_assignment", // Interaction -> Execution: assigns task
  "status_update", // Execution -> Interaction: progress update
  "result", // Execution -> Interaction: final result
  "error", // Execution -> Interaction: error occurred
  "cancellation", // Interaction -> Execution: cancel task
]);
