import { relations } from 'drizzle-orm';
import { tasks, taskSteps } from '../tables/tasks';
import { users } from '../tables/users';
import { messages } from '../tables/messaging';

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  triggerMessage: one(messages, {
    fields: [tasks.triggerMessageId],
    references: [messages.id],
    relationName: 'triggerMessage',
  }),
  completionMessage: one(messages, {
    fields: [tasks.completionMessageId],
    references: [messages.id],
    relationName: 'completionMessage',
  }),
  steps: many(taskSteps),
}));

export const taskStepsRelations = relations(taskSteps, ({ one }) => ({
  task: one(tasks, {
    fields: [taskSteps.taskId],
    references: [tasks.id],
  }),
}));