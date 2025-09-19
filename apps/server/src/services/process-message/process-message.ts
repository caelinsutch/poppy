import { db, messages } from "@poppy/db";
import { dbMessageToUIMessage } from "@poppy/lib";
import { convertToModelMessages } from "ai";
import { desc, eq } from "drizzle-orm";
import { sendLoopMessage } from "../loop/send-loop-message";
import { checkShouldRespond } from "./check-should-respond";
import { mainResponse } from "./main-response";
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
    logger,
  } = options;

  logger?.info(
    {
      messageId: currentMessage.id,
      conversationId: currentMessage.conversationId,
      partsCount: currentParts.length,
      historyCount: conversationHistory.length,
      participantCount: participants.length,
      isGroup: conversation?.isGroup || false,
    },
    "Processing message with conversation history",
  );

  // Convert all messages to UI message format
  const uiMessages = conversationHistory.map(({ message, parts }) =>
    dbMessageToUIMessage(message, parts, conversation.isGroup),
  );

  logger?.info("uiMessages generated");

  // Convert UI messages to model messages for the AI SDK
  const modelMessages = convertToModelMessages(uiMessages);

  logger?.info("modelMessages generated");

  try {
    const shouldRespond = await checkShouldRespond(modelMessages, options);

    if (!shouldRespond) {
      logger?.info(
        {
          messageId: currentMessage.id,
          shouldRespond,
        },
        "Skipping response",
      );
      return;
    }

    logger?.info(
      {
        messageId: currentMessage.id,
        shouldRespond,
      },
      "Should respond to message",
    );

    const {
      text,
      usage,
      messages: aiMessages,
    } = await mainResponse(modelMessages, options);

    logger?.info(
      {
        messageId: currentMessage.id,
        response: text,
        usage,
        aiMessages,
      },
      "Generated AI response",
    );

    // Don't send if there's newer messages in the conversation
    const recentMessage = await db.query.messages.findMany({
      where: eq(messages.conversationId, currentMessage.conversationId),
      orderBy: desc(messages.createdAt),
      limit: 5,
    });

    const firstOutbound = recentMessage.find((m) => m.isOutbound);

    if (firstOutbound && firstOutbound.createdAt > currentMessage.createdAt) {
      logger?.info(
        {
          messageId: currentMessage.id,
          recentMessageId: firstOutbound.id,
        },
        "Skipping response because there are newer messages in the conversation",
      );
      return;
    }

    // Send the message via Loop Message and save to database
    const sendResult = await sendLoopMessage({
      text,
      conversationId: currentMessage.conversationId,
      logger,
      aiMessages,
    });

    logger?.info(
      {
        loopMessageId: sendResult.loopMessageIds,
        conversationId: sendResult.conversationId,
      },
      "Successfully processed and sent message",
    );
  } catch (error) {
    logger?.error(
      {
        messageId: currentMessage.id,
        error,
      },
      "Failed to generate AI response",
    );
    throw error;
  }
};
