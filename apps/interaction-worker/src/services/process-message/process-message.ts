import { messages } from "@poppy/db";
import { dbMessagesToModelMessages } from "@poppy/lib";
import { desc, eq } from "drizzle-orm";
import { checkShouldRespond } from "./check-should-respond";
import { mainResponse } from "./main-response";
import { sendLoopMessage } from "./send-loop-message";
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

  // Convert all messages to UI message format
  const modelMessages = dbMessagesToModelMessages(
    conversationHistory,
    conversation?.isGroup,
  );

  console.log("Generated UI messages", {
    modelMessages,
  });

  console.log("Generated model messages");

  try {
    const shouldRespond = await checkShouldRespond(modelMessages, options);

    if (!shouldRespond) {
      console.log("Skipping response", {
        messageId: currentMessage.id,
        shouldRespond,
      });
      return;
    }

    console.log("Should respond to message", {
      messageId: currentMessage.id,
      shouldRespond,
    });

    const {
      text,
      usage,
      messages: aiMessages,
    } = await mainResponse(modelMessages, options);

    console.log("Generated AI response", {
      messageId: currentMessage.id,
      response: text,
      usage,
    });

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

    // Send the message via Loop Message and save to database
    const sendResult = await sendLoopMessage({
      text,
      conversationId: currentMessage.conversationId,
      aiMessages,
      db,
      env,
    });

    console.log("Successfully processed and sent message", {
      loopMessageIds: sendResult.loopMessageIds,
      conversationId: sendResult.conversationId,
    });
  } catch (error) {
    console.error("Failed to generate AI response", {
      messageId: currentMessage.id,
      error,
    });
    throw error;
  }
};
