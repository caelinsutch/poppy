import { pgTable, uuid, timestamp, jsonb, varchar, text, integer } from 'drizzle-orm/pg-core';
import { taskStatusEnum, taskTypeEnum, stepTypeEnum } from './enums';
import { users } from './users';
import { messages } from './messaging';
import { TaskInputParams, FinalOptions, TaskMetadata, StepInput, StepOutput } from '@poppy/schemas';

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  conversationId: uuid('conversation_id').notNull(),
  
  // Message linking
  triggerMessageId: varchar('trigger_message_id').notNull().references(() => messages.id),
  completionMessageId: varchar('completion_message_id').references(() => messages.id),
  
  status: taskStatusEnum('status').notNull().default('initialized'),
  taskType: taskTypeEnum('task_type').notNull(),
  
  // Flexible storage
  inputParams: jsonb('input_params').notNull().$type<TaskInputParams>(),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  expiresAt: timestamp('expires_at'),
  
  // Results
  finalOptions: jsonb('final_options').$type<FinalOptions>(),
  selectedOptionId: varchar('selected_option_id', { length: 100 }),
  metadata: jsonb('metadata').$type<TaskMetadata>(),
});

export const taskSteps = pgTable('task_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  stepType: stepTypeEnum('step_type').notNull(),
  agentId: varchar('agent_id', { length: 100 }),
  
  input: jsonb('input').notNull().$type<StepInput>(),
  output: jsonb('output').$type<StepOutput>(),
  
  status: varchar('status', { length: 50 }).notNull(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
  
  sequenceNumber: integer('sequence_number').notNull(),
});