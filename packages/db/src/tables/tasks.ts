import { pgTable, uuid, timestamp, jsonb, varchar, text, boolean, integer } from 'drizzle-orm/pg-core';
import { taskStatusEnum, taskTypeEnum } from './enums';
import { users } from './users';
import { messages } from './messaging';
import { TaskInputParams, FinalOptions, TaskMetadata } from '@poppy/schemas';

// Core task definition (can be one-time or recurring)
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),

  taskType: taskTypeEnum('task_type').notNull(),

  // Scheduling configuration
  isRecurring: boolean('is_recurring').notNull().default(false),
  cronExpression: varchar('cron_expression', { length: 100 }), // e.g., '0 */1 * * *' for hourly
  nextRunAt: timestamp('next_run_at'), // For scheduled/recurring tasks
  lastRunAt: timestamp('last_run_at'), // Track last execution for recurring tasks
  maxRuns: integer('max_runs'), // Optional limit on number of executions
  currentRunCount: integer('current_run_count').notNull().default(0),

  // Completion conditions for recurring tasks
  completionCondition: jsonb('completion_condition'), // e.g., { type: 'match_found', criteria: {...} }
  autoDisableOnSuccess: boolean('auto_disable_on_success').default(false), // Stop recurring when condition met

  // Status management
  isActive: boolean('is_active').notNull().default(true), // Can pause/resume recurring tasks
  status: taskStatusEnum('status').notNull().default('initialized'),

  // Task configuration
  inputParams: jsonb('input_params').notNull().$type<TaskInputParams>(),
  metadata: jsonb('metadata').$type<TaskMetadata>(),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'), // Task expiration (e.g., stop checking after date)
});

// Individual task executions (runs)
export const taskRuns = pgTable('task_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),

  runNumber: integer('run_number').notNull(), // Sequential run number for this task
  status: taskStatusEnum('status').notNull().default('initialized'),

  // Results from this specific run
  finalOptions: jsonb('final_options').$type<FinalOptions>(),
  runMetadata: jsonb('run_metadata'), // Metrics, performance data for this run

  // Timestamps
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),

  // Error tracking
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
});

// Task events - meaningful interactions and state changes
export const taskEvents = pgTable('task_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  taskRunId: uuid('task_run_id').references(() => taskRuns.id, { onDelete: 'cascade' }), // Optional - only if event relates to specific run

  // Event classification
  eventType: varchar('event_type', { length: 50 }).notNull(),
  // Types: 'created', 'paused', 'resumed', 'match_found', 'user_modified', 'expired', 'cancelled', 'completed', 'failed'

  // Conversation context
  conversationId: uuid('conversation_id'),

  // Message associations (when event involves messages)
  triggerMessageId: varchar('trigger_message_id').references(() => messages.id), // User message that triggered event
  responseMessageId: varchar('response_message_id').references(() => messages.id), // Bot response message

  // Event details
  eventSource: varchar('event_source', { length: 100 }), // 'imessage', 'api', 'dashboard', 'system', etc.
  eventMetadata: jsonb('event_metadata'), // Additional event-specific data

  // Timestamp
  createdAt: timestamp('created_at').notNull().defaultNow(),
});