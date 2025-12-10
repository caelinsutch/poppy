import { agents, messages as messagesTable, parts } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { formatAgentConversation } from "@poppy/lib";
import { generateId } from "ai";
import { and, desc, eq, isNull } from "drizzle-orm";
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

  completionLogger.info(input);

  try {
    // Get the execution agent
    const executionAgent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!executionAgent) {
      completionLogger.error("Execution agent not found", { agentId });
      throw new Error(`Execution agent not found: ${agentId}`);
    }

    if (success && result) {
      completionLogger.info("Agent result", {
        result: result.length > 500 ? `${result.substring(0, 500)}...` : result,
      });
    } else if (error) {
      completionLogger.error("Agent error", {
        error: error.length > 500 ? `${error.substring(0, 500)}...` : error,
      });
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

    // Create part record for the message content
    const messageContent = success
      ? result || "Task completed with no output"
      : error || "Task failed with unknown error";

    await db.insert(parts).values({
      id: generateId(),
      messageId,
      type: "text",
      content: {
        type: "text",
        text: messageContent,
      },
      order: 0,
    });

    // Fetch conversation history (exclude agent messages)
    // Only get user messages and Poppy replies - not agent-to-agent messages
    const conversationHistory = await db.query.messages.findMany({
      where: and(
        eq(messagesTable.conversationId, conversationId),
        // Exclude agent messages - agent messages have fromAgentId or toAgentId set
        isNull(messagesTable.fromAgentId),
        isNull(messagesTable.toAgentId),
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

    // Fetch the newly inserted message with its parts
    const newMessage = await db.query.messages.findFirst({
      where: eq(messagesTable.id, messageId),
      with: {
        parts: {
          orderBy: (parts, { asc }) => [asc(parts.order)],
        },
      },
    });

    if (!newMessage) {
      completionLogger.error("Failed to fetch newly inserted message", {
        messageId,
      });
      throw new Error(`Message not found: ${messageId}`);
    }

    // Format conversation with the new agent message
    const formattedConversation = formatAgentConversation({
      conversationHistory: conversationHistory.map((msg) => ({
        message: msg,
        parts: msg.parts,
      })),
      agentMessages: formattedAgentMessages,
      currentAgentMessage: {
        fromAgent: executionAgent,
        toAgent: interactionAgent,
        message: newMessage,
        parts: newMessage.parts || [],
      },
      isGroup: conversation.isGroup,
    });

    logger.info("Formatted conversation", {
      formattedConversation,
    });

    // Generate response from interaction agent
    const { messagesToUser, hasUserMessages } = await generateResponse(
      formattedConversation,
      {
        conversation,
        currentParts: newMessage.parts || [],
        conversationHistory: conversationHistory.map((msg) => ({
          message: msg,
          parts: msg.parts,
        })),
        participants: [],
        env,
        db,
        interactionAgentId: interactionAgent.id,
        currentMessage: newMessage,
      },
    );

    completionLogger.info("Generated response", {
      messageCount: messagesToUser.length,
      messages: messagesToUser,
    });

    // Only send messages if the agent explicitly chose to respond to user
    if (!hasUserMessages) {
      return;
    }

    // Guard: Don't send if there's a recent outbound message (prevents double responses)
    const recentMessages = await db.query.messages.findMany({
      where: eq(messagesTable.conversationId, conversationId),
      orderBy: desc(messagesTable.createdAt),
      limit: 5,
    });

    const recentOutbound = recentMessages.find((m: any) => m.isOutbound);
    const agentMessageTime = newMessage.createdAt;

    if (recentOutbound && recentOutbound.createdAt > agentMessageTime) {
      completionLogger.info(
        "Skipping response - newer outbound message already exists",
        {
          recentOutboundId: recentOutbound.id,
          recentOutboundTime: recentOutbound.createdAt,
          agentMessageTime,
        },
      );
      return;
    }

    // Also check if a very recent outbound exists (within 10 seconds of now)
    // This prevents double responses when the interaction agent both asked a question
    // AND delegated to an execution agent in the same turn
    const now = new Date();
    const tenSecondsAgo = new Date(now.getTime() - 10000);

    if (recentOutbound && recentOutbound.createdAt > tenSecondsAgo) {
      completionLogger.info(
        "Skipping response - outbound message sent within last 10 seconds",
        {
          recentOutboundId: recentOutbound.id,
          recentOutboundTime: recentOutbound.createdAt,
          threshold: tenSecondsAgo,
        },
      );
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

    completionLogger.info("Sent messages to user", {
      messageCount: messagesToUser.length,
    });
  } catch (error) {
    completionLogger.error("Failed to process agent completion", {
      error,
    });
    throw error;
  }
};
