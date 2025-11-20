import { agents, messages as messagesTable } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { formatAgentConversation } from "@poppy/lib";
import { generateId } from "ai";
import { and, eq } from "drizzle-orm";
import type { WorkerEnv } from "../../context";
import type { Database } from "../../db/client";
import { getOrCreateInteractionAgent } from "../agents";
import { sendLoopMessage } from "../loop/send-loop-message";
import { generateResponse } from "./generate-response";

export type AgentCompletionInput = {
  agentId: string;
  conversationId: string;
  success: boolean;
  result?: string;
  error?: string;
};

export const processAgentCompletion = async (
  input: AgentCompletionInput,
  db: Database,
  env: WorkerEnv,
): Promise<void> => {
  const { agentId, conversationId, success, result, error } = input;

  const completionLogger = logger.withTags({
    agentId,
    conversationId,
    success,
  });

  completionLogger.info("Processing agent completion", {
    hasResult: !!result,
    hasError: !!error,
  });

  try {
    // Get the execution agent
    const executionAgent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!executionAgent) {
      completionLogger.error("Execution agent not found", { agentId });
      throw new Error(`Execution agent not found: ${agentId}`);
    }

    // Get or create interaction agent for this conversation
    const interactionAgent = await getOrCreateInteractionAgent(
      db,
      conversationId,
    );

    // Insert agent message into database
    const messageId = generateId();
    await db.insert(messagesTable).values({
      id: messageId,
      conversationId,
      fromAgentId: agentId,
      toAgentId: interactionAgent.id,
      agentMessageType: success ? "result" : "error",
      isOutbound: false,
      rawPayload: {
        role: "assistant",
        agentMessage: true,
        success,
        result,
        error,
      },
    });

    completionLogger.info("Recorded agent completion message in database", {
      messageId,
      messageType: success ? "result" : "error",
    });

    // Fetch conversation history
    const conversationHistory = await db.query.messages.findMany({
      where: and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.isOutbound, false),
      ),
      with: {
        parts: {
          orderBy: (parts, { asc }) => [asc(parts.order)],
        },
      },
      orderBy: (messages, { asc }) => [asc(messages.createdAt)],
    });

    // Fetch all agent messages for this conversation
    const agentMessages = await db.query.messages.findMany({
      where: and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.toAgentId, interactionAgent.id),
      ),
      with: {
        parts: {
          orderBy: (parts, { asc }) => [asc(parts.order)],
        },
        fromAgent: true,
      },
      orderBy: (messages, { asc }) => [asc(messages.createdAt)],
    });

    // Format agent messages
    const formattedAgentMessages = agentMessages.map((msg: any) => ({
      fromAgent: msg.fromAgent,
      toAgent: interactionAgent,
      message: msg,
      parts: msg.parts,
    }));

    // Get the conversation record
    const conversation = await db.query.conversations.findFirst({
      where: (conversations, { eq }) => eq(conversations.id, conversationId),
    });

    if (!conversation) {
      completionLogger.error("Conversation not found", { conversationId });
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Fetch the newly inserted message
    const newMessage = await db.query.messages.findFirst({
      where: eq(messagesTable.id, messageId),
    });

    if (!newMessage) {
      completionLogger.error("Failed to fetch newly inserted message", {
        messageId,
      });
      throw new Error(`Message not found: ${messageId}`);
    }

    // Format conversation with the new agent message
    const formattedConversation = formatAgentConversation({
      conversationHistory: conversationHistory.map((msg: any) => ({
        message: msg,
        parts: msg.parts,
      })),
      agentMessages: formattedAgentMessages,
      currentAgentMessage: {
        fromAgent: executionAgent,
        toAgent: interactionAgent,
        message: newMessage,
        parts: [],
      },
      isGroup: conversation.isGroup,
    });

    completionLogger.info("Formatted conversation for processing", {
      conversationLength: formattedConversation.length,
      agentMessageCount: formattedAgentMessages.length,
    });

    // Generate response from interaction agent
    const { messagesToUser, hasUserMessages, usage } = await generateResponse(
      formattedConversation,
      {
        conversation,
        conversationHistory: conversationHistory.map((msg: any) => ({
          message: msg,
          parts: msg.parts,
        })),
        participants: [],
        env,
        db,
        interactionAgentId: interactionAgent.id,
        currentMessage: newMessage as any,
        currentParts: [],
      },
    );

    completionLogger.info("Generated response from interaction agent", {
      hasUserMessages,
      messageCount: messagesToUser.length,
      usage,
    });

    // Only send messages if the agent explicitly chose to respond to user
    if (!hasUserMessages) {
      completionLogger.info("Interaction agent chose not to respond to user");
      return;
    }

    // Send all messages to user
    const loopMessageIds: string[] = [];
    for (const messageText of messagesToUser) {
      const sendResult = await sendLoopMessage({
        text: messageText,
        conversationId,
        db,
      });
      loopMessageIds.push(...sendResult.loopMessageIds);
    }

    completionLogger.info("Successfully sent messages to user", {
      loopMessageIds,
      messageCount: messagesToUser.length,
    });
  } catch (error) {
    completionLogger.error("Failed to process agent completion", {
      error,
    });
    throw error;
  }
};
