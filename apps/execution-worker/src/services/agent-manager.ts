import type { Agent, getDb } from "@poppy/db";
import { agents } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { eq } from "drizzle-orm";

type Database = ReturnType<typeof getDb>;

/**
 * Update agent status in the database
 */
export const updateAgentStatus = async (
  db: Database,
  agentId: string,
  status: Agent["status"],
  options?: {
    result?: unknown;
    errorMessage?: string;
  },
): Promise<Agent> => {
  logger.withTags({ agentId }).info("Updating agent status", {
    newStatus: status,
    hasResult: !!options?.result,
    hasError: !!options?.errorMessage,
  });

  const updateData: Partial<Agent> = {
    status,
  };

  if (status === "completed" || status === "failed") {
    updateData.completedAt = new Date();
  }

  if (options?.result) {
    updateData.result = options.result;
  }

  if (options?.errorMessage) {
    updateData.errorMessage = options.errorMessage;
  }

  const [updatedAgent] = await db
    .update(agents)
    .set(updateData)
    .where(eq(agents.id, agentId))
    .returning();

  logger.withTags({ agentId }).info("Updated agent status", {
    status: updatedAgent.status,
    completedAt: updatedAgent.completedAt,
  });

  return updatedAgent;
};
