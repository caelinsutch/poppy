import { relations } from "drizzle-orm";
import { messages } from "../tables/messaging";
import { taskEvents, taskRuns, tasks } from "../tables/tasks";
import { users } from "../tables/users";

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  runs: many(taskRuns),
  events: many(taskEvents),
}));

export const taskRunsRelations = relations(taskRuns, ({ one, many }) => ({
  task: one(tasks, {
    fields: [taskRuns.taskId],
    references: [tasks.id],
  }),
  events: many(taskEvents),
}));

export const taskEventsRelations = relations(taskEvents, ({ one }) => ({
  task: one(tasks, {
    fields: [taskEvents.taskId],
    references: [tasks.id],
  }),
  run: one(taskRuns, {
    fields: [taskEvents.taskRunId],
    references: [taskRuns.id],
  }),
  triggerMessage: one(messages, {
    fields: [taskEvents.triggerMessageId],
    references: [messages.id],
    relationName: "triggerMessage",
  }),
  responseMessage: one(messages, {
    fields: [taskEvents.responseMessageId],
    references: [messages.id],
    relationName: "responseMessage",
  }),
}));
