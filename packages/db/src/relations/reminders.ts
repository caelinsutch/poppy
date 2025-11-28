import { relations } from "drizzle-orm";
import { agents } from "../tables/agents";
import { conversations } from "../tables/messaging";
import { reminders } from "../tables/reminders";

export const remindersRelations = relations(reminders, ({ one }) => ({
  agent: one(agents, {
    fields: [reminders.agentId],
    references: [agents.id],
  }),
  conversation: one(conversations, {
    fields: [reminders.conversationId],
    references: [conversations.id],
  }),
}));
