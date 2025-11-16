import { messages } from "@poppy/db";
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

  console.log("Processing message with conversation history", {
    messageId: currentMessage.id,
    conversationId: currentMessage.conversationId,
    partsCount: currentParts.length,
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

    console.log("Using interaction agent", {
      agentId: interactionAgent.id,
      conversationId: conversation.id,
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

    console.log("Formatted conversation for agent processing");

    const { messagesToUser, hasUserMessages, usage } = await generateResponse(
      formattedConversation,
      {
        ...options,
        interactionAgentId: interactionAgent.id,
      },
    );

    console.log("Generated AI response", {
      messageId: currentMessage.id,
      hasUserMessages,
      messageCount: messagesToUser.length,
      usage,
    });

    // Only send messages if the agent explicitly chose to respond to user
    if (!hasUserMessages) {
      console.log("Agent chose not to respond to user", {
        messageId: currentMessage.id,
      });
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
      console.log(
        "Skipping response because there are newer messages in the conversation",
        {
          messageId: currentMessage.id,
          recentMessageId: firstOutbound.id,
        },
      );
      return;
    }

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

    console.log("Successfully processed and sent messages", {
      loopMessageIds,
      conversationId: currentMessage.conversationId,
      messageCount: messagesToUser.length,
    });
  } catch (error) {
    console.error("Failed to generate AI response", {
      messageId: currentMessage.id,
      error,
    });
    throw error;
  }
};
