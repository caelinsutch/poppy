import { messages } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { formatAgentConversation } from "@poppy/lib";
import { and, desc, eq } from "drizzle-orm";
import { getOrCreateInteractionAgent } from "../agents";
import { sendLoopMessage } from "../loop/send-loop-message";
import { generateResponse } from "./generate-response";
import type { ProcessMessageOptions } from "./types";

export const processMessage = async (
  options: ProcessMessageOptions,
): Promise<void> => {
  const {
    currentMessage,
    currentParts,
    conversation,
    conversationHistory,
    participants,
    env,
    db,
  } = options;

  logger
    .withTags({
      messageId: currentMessage.id,
      conversationId: currentMessage.conversationId,
    })
    .info("Processing message with conversation history", {
      historyCount: conversationHistory.length,
      participantCount: participants.length,
      isGroup: conversation?.isGroup || false,
    });

  try {
    // Get or create interaction agent for this conversation
    const interactionAgent = await getOrCreateInteractionAgent(
      db,
      conversation.id,
    );

    logger
      .withTags({
        messageId: currentMessage.id,
        conversationId: conversation.id,
        agentId: interactionAgent.id,
      })
      .info("Using interaction agent", {
        agentType: interactionAgent.agentType,
        agentStatus: interactionAgent.status,
      });

    // Fetch agent messages for this conversation
    const agentMessages = await db.query.messages.findMany({
      where: and(
        eq(messages.conversationId, conversation.id),
        eq(messages.toAgentId, interactionAgent.id),
      ),
      with: {
        parts: {
          orderBy: (parts, { asc }) => [asc(parts.order)],
        },
        fromAgent: true,
      },
      orderBy: (messages, { asc }) => [asc(messages.createdAt)],
    });

    // Format agent messages for the conversation formatter
    const formattedAgentMessages = agentMessages.map((msg: any) => ({
      fromAgent: msg.fromAgent,
      toAgent: interactionAgent,
      message: msg,
      parts: msg.parts,
    }));

    // Format conversation in XML structure
    const formattedConversation = formatAgentConversation({
      conversationHistory,
      agentMessages: formattedAgentMessages,
      currentMessage: {
        message: currentMessage,
        parts: currentParts,
      },
      isGroup: conversation?.isGroup,
    });

    logger
      .withTags({
        messageId: currentMessage.id,
        conversationId: conversation.id,
        agentId: interactionAgent.id,
      })
      .info("Formatted conversation for agent processing", {
        conversationLength: formattedConversation.length,
        agentMessageCount: formattedAgentMessages.length,
        formatAgentConversation,
      });

    const { messagesToUser, hasUserMessages, usage } = await generateResponse(
      formattedConversation,
      {
        ...options,
        interactionAgentId: interactionAgent.id,
      },
    );

    logger
      .withTags({
        messageId: currentMessage.id,
        conversationId: conversation.id,
        agentId: interactionAgent.id,
      })
      .info("Generated AI response", {
        hasUserMessages,
        messageCount: messagesToUser.length,
        usage,
      });

    // Only send messages if the agent explicitly chose to respond to user
    if (!hasUserMessages) {
      logger
        .withTags({
          messageId: currentMessage.id,
          conversationId: conversation.id,
          agentId: interactionAgent.id,
        })
        .info("Agent chose not to respond to user");
      return;
    }

    // Don't send if there's newer messages in the conversation
    const recentMessage = await db.query.messages.findMany({
      where: eq(messages.conversationId, currentMessage.conversationId),
      orderBy: desc(messages.createdAt),
      limit: 5,
    });

    const firstOutbound = recentMessage.find((m: any) => m.isOutbound);

    if (firstOutbound && firstOutbound.createdAt > currentMessage.createdAt) {
      logger
        .withTags({
          messageId: currentMessage.id,
          conversationId: conversation.id,
          agentId: interactionAgent.id,
        })
        .info("Skipping response due to newer outbound message", {
          recentMessageId: firstOutbound.id,
          recentMessageTime: firstOutbound.createdAt,
          currentMessageTime: currentMessage.createdAt,
        });
      return;
    }

    logger
      .withTags({
        messageId: currentMessage.id,
        conversationId: conversation.id,
        agentId: interactionAgent.id,
      })
      .info("Sending messages to user", {
        messageCount: messagesToUser.length,
      });

    // Send all messages to user
    const loopMessageIds: string[] = [];
    for (const messageText of messagesToUser) {
      const sendResult = await sendLoopMessage({
        text: messageText,
        conversationId: currentMessage.conversationId,
        db,
      });
      loopMessageIds.push(...sendResult.loopMessageIds);
    }

    logger
      .withTags({
        messageId: currentMessage.id,
        conversationId: conversation.id,
        agentId: interactionAgent.id,
      })
      .info("Successfully processed and sent messages", {
        loopMessageIds,
        messageCount: messagesToUser.length,
      });
  } catch (error) {
    logger
      .withTags({
        messageId: currentMessage.id,
        conversationId: currentMessage.conversationId,
      })
      .error("Failed to generate AI response", {
        error,
      });
    throw error;
  }
};
