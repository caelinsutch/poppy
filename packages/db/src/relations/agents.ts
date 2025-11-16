import { relations } from "drizzle-orm";
import { agents } from "../tables/agents";
import { conversations, messages } from "../tables/messaging";
import { taskRuns, tasks } from "../tables/tasks";

export const agentsRelations = relations(agents, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [agents.conversationId],
    references: [conversations.id],
  }),
  task: one(tasks, {
    fields: [agents.taskId],
    references: [tasks.id],
  }),
  taskRun: one(taskRuns, {
    fields: [agents.taskRunId],
    references: [taskRuns.id],
  }),
  parentInteractionAgent: one(agents, {
    fields: [agents.parentInteractionAgentId],
    references: [agents.id],
    relationName: "parentChild",
  }),
  childAgents: many(agents, { relationName: "parentChild" }),
  sentMessages: many(messages, { relationName: "fromAgent" }),
  receivedMessages: many(messages, { relationName: "toAgent" }),
}));
