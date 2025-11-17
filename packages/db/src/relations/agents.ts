import { relations } from "drizzle-orm";
import { agents } from "../tables/agents";
import { conversations, messages } from "../tables/messaging";

export const agentsRelations = relations(agents, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [agents.conversationId],
    references: [conversations.id],
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
