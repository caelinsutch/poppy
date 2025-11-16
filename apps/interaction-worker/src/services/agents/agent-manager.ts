import type { Agent, getDb, Message } from "@poppy/db";
import { agents, messages } from "@poppy/db";
import { and, eq } from "drizzle-orm";

type Database = ReturnType<typeof getDb>;

/**
 * Get or create an interaction agent for a conversation
 */
export const getOrCreateInteractionAgent = async (
  db: Database,
  conversationId: string,
): Promise<Agent> => {
  // Try to find an existing active interaction agent
  const existingAgent = await db.query.agents.findFirst({
    where: and(
      eq(agents.conversationId, conversationId),
      eq(agents.agentType, "interaction"),
      eq(agents.status, "active"),
    ),
  });

  if (existingAgent) {
    return existingAgent;
  }

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
  // Find active execution agents for this interaction agent
  const childAgents = await db.query.agents.findMany({
    where: and(
      eq(agents.parentInteractionAgentId, parentInteractionAgentId),
      eq(agents.agentType, "execution"),
      eq(agents.status, "active"),
    ),
  });

  // Find agent where purpose contains the keyword
  const matchingAgent = childAgents.find((agent) =>
    agent.purpose?.toLowerCase().includes(purposeKeyword.toLowerCase()),
  );

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
