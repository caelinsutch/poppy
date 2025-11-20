import { agents, messages as messagesTable, parts } from "@poppy/db";
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

    // Log detailed agent information
    completionLogger.info("Agent details", {
      agentType: executionAgent.agentType,
      agentPurpose: executionAgent.purpose,
      agentStatus: executionAgent.status,
    });

    // Log the full output before processing
    if (success && result) {
      const truncatedResult =
        result.length > 500
          ? `${result.slice(0, 500)}... (truncated, total length: ${result.length})`
          : result;
      completionLogger.info("Agent completion result", {
        resultLength: result.length,
        resultPreview: truncatedResult,
      });
    } else if (error) {
      const truncatedError =
        error.length > 500
          ? `${error.slice(0, 500)}... (truncated, total length: ${error.length})`
          : error;
      completionLogger.error("Agent completion error", {
        errorLength: error.length,
        errorDetails: truncatedError,
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

    completionLogger.info("Recorded agent completion message in database", {
      messageId,
      messageType: success ? "result" : "error",
      contentLength: messageContent.length,
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
      conversationHistory: conversationHistory.map((msg: any) => ({
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

    completionLogger.info("Formatted conversation for processing", {
      conversationLength: formattedConversation.length,
      agentMessageCount: formattedAgentMessages.length,
    });

    // Log the data being sent to the interaction agent
    completionLogger.info("Sending agent output to interaction agent", {
      fromAgentType: executionAgent.agentType,
      fromAgentPurpose: executionAgent.purpose,
      toAgentId: interactionAgent.id,
      messageType: success ? "result" : "error",
      messageContent: messageContent,
      messageContentLength: messageContent.length,
      conversationHistoryCount: conversationHistory.length,
      agentMessageCount: formattedAgentMessages.length,
      formattedConversationLength: formattedConversation.length,
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

    // Log the interaction agent's response messages
    if (hasUserMessages && messagesToUser.length > 0) {
      messagesToUser.forEach((msg, index) => {
        const truncatedMsg =
          msg.length > 500
            ? `${msg.slice(0, 500)}... (truncated, total length: ${msg.length})`
            : msg;
        completionLogger.info(
          `Interaction agent response message ${index + 1}`,
          {
            messageIndex: index,
            messageLength: msg.length,
            messagePreview: truncatedMsg,
          },
        );
      });
    }

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
