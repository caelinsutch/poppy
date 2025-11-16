import type { Agent, getDb, Message } from "@poppy/db";
import { agents, messages } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { and, eq } from "drizzle-orm";

type Database = ReturnType<typeof getDb>;

/**
 * Get or create an interaction agent for a conversation
 */
export const getOrCreateInteractionAgent = async (
  db: Database,
  conversationId: string,
): Promise<Agent> => {
  logger
    .withTags({ conversationId })
    .info("Getting or creating interaction agent");

  // Try to find an existing active interaction agent
  const existingAgent = await db.query.agents.findFirst({
    where: and(
      eq(agents.conversationId, conversationId),
      eq(agents.agentType, "interaction"),
      eq(agents.status, "active"),
    ),
  });

  if (existingAgent) {
    logger
      .withTags({ conversationId, agentId: existingAgent.id })
      .info("Found existing interaction agent", {
        agentStatus: existingAgent.status,
        createdAt: existingAgent.createdAt,
      });
    return existingAgent;
  }

  logger.withTags({ conversationId }).info("Creating new interaction agent");

  // Create a new interaction agent
  const [newAgent] = await db
    .insert(agents)
    .values({
      agentType: "interaction",
      conversationId,
      purpose: "conversation_handler",
      status: "active",
    })
    .returning();

  logger
    .withTags({ conversationId, agentId: newAgent.id })
    .info("Created new interaction agent", {
      agentType: newAgent.agentType,
      purpose: newAgent.purpose,
    });

  return newAgent;
};

/**
 * Create an execution agent for a task
 */
export const createExecutionAgent = async (
  db: Database,
  options: {
    parentInteractionAgentId: string;
    conversationId: string;
    purpose: string;
    taskId?: string;
    taskRunId?: string;
  },
): Promise<Agent> => {
  const {
    parentInteractionAgentId,
    conversationId,
    purpose,
    taskId,
    taskRunId,
  } = options;

  logger
    .withTags({
      conversationId,
      parentInteractionAgentId,
    })
    .info("Creating execution agent", {
      purpose,
      taskId,
      taskRunId,
    });

  const [executionAgent] = await db
    .insert(agents)
    .values({
      agentType: "execution",
      parentInteractionAgentId,
      conversationId,
      purpose,
      taskId,
      taskRunId,
      status: "active",
    })
    .returning();

  logger
    .withTags({
      conversationId,
      parentInteractionAgentId,
      agentId: executionAgent.id,
    })
    .info("Created execution agent", {
      purpose: executionAgent.purpose,
      agentType: executionAgent.agentType,
    });

  return executionAgent;
};

/**
 * Find an existing execution agent by purpose/name
 */
export const findExecutionAgentByPurpose = async (
  db: Database,
  parentInteractionAgentId: string,
  purposeKeyword: string,
): Promise<Agent | undefined> => {
  logger
    .withTags({ parentInteractionAgentId })
    .info("Finding execution agent by purpose", {
      purposeKeyword,
    });

  // Find active execution agents for this interaction agent
  const childAgents = await db.query.agents.findMany({
    where: and(
      eq(agents.parentInteractionAgentId, parentInteractionAgentId),
      eq(agents.agentType, "execution"),
      eq(agents.status, "active"),
    ),
  });

  logger.withTags({ parentInteractionAgentId }).info("Found child agents", {
    childAgentCount: childAgents.length,
  });

  // Find agent where purpose contains the keyword
  const matchingAgent = childAgents.find((agent) =>
    agent.purpose?.toLowerCase().includes(purposeKeyword.toLowerCase()),
  );

  if (matchingAgent) {
    logger
      .withTags({
        parentInteractionAgentId,
        agentId: matchingAgent.id,
      })
      .info("Found matching execution agent", {
        purpose: matchingAgent.purpose,
      });
  } else {
    logger
      .withTags({ parentInteractionAgentId })
      .info("No matching execution agent found", {
        purposeKeyword,
      });
  }

  return matchingAgent;
};

/**
 * Get all active execution agents for an interaction agent
 */
export const getActiveExecutionAgents = async (
  db: Database,
  parentInteractionAgentId: string,
): Promise<Agent[]> => {
  return db.query.agents.findMany({
    where: and(
      eq(agents.parentInteractionAgentId, parentInteractionAgentId),
      eq(agents.agentType, "execution"),
      eq(agents.status, "active"),
    ),
  });
};

/**
 * Update agent status
 */
export const updateAgentStatus = async (
  db: Database,
  agentId: string,
  status: Agent["status"],
  options?: {
    result?: any;
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

/**
 * Get agent messages (messages where this agent is the recipient)
 */
export const getAgentMessages = async (
  db: Database,
  toAgentId: string,
): Promise<Array<{ message: Message; parts: any[] }>> => {
  const agentMessages = await db.query.messages.findMany({
    where: eq(messages.toAgentId, toAgentId),
    with: {
      parts: {
        orderBy: (parts, { asc }) => [asc(parts.order)],
      },
      fromAgent: true,
    },
    orderBy: (messages, { asc }) => [asc(messages.createdAt)],
  });

  return agentMessages.map((msg: any) => ({
    message: msg,
    parts: msg.parts,
  }));
};
