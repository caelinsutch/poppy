import {
  conversationParticipants,
  conversations,
  db,
  messages,
  type NewMessage,
  type NewPart,
  parts,
  users,
} from "@poppy/db";
import type { LoopMessageSendRequest } from "@poppy/schemas";
import { generateId, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { UIToolTypes } from "@/tools";
import { loopClient } from "../../clients/loop-message";

export interface SendLoopMessageOptions {
  text: string;
  conversationId: string;
  logger?: FastifyBaseLogger;
  aiMessages: UIMessage<unknown, any, UIToolTypes>[];
}

export const sendLoopMessage = async (options: SendLoopMessageOptions) => {
  const { text, conversationId, logger, aiMessages } = options;

  const byLine = text.split("\n").filter((line) => line.trim());

  // Fetch conversation with participants in a single query
  const result = await db
    .select({
      conversation: conversations,
      phoneNumber: users.phoneNumber,
    })
    .from(conversations)
    .leftJoin(
      conversationParticipants,
      eq(conversationParticipants.conversationId, conversations.id),
    )
    .leftJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversations.id, conversationId));

  if (!result.length || !result[0].conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const conversation = result[0].conversation;
  const participants = result
    .map((r) => r.phoneNumber)
    .filter((p): p is string => p !== null);

  // Build the request based on whether it's a group or individual conversation
  let sendRequest: LoopMessageSendRequest;

  if (conversation.loopMessageGroupId) {
    // Group message - use group_id
    sendRequest = {
      group: conversation.loopMessageGroupId,
      text,
      sender_name: conversation.sender,
    };
  } else {
    // Individual message - find the recipient (participant who is NOT the sender/bot)
    const recipient = participants.find((p) => p !== conversation.sender);

    if (!recipient) {
      throw new Error(
        `Could not determine recipient for conversation: ${conversationId}`,
      );
    }

    sendRequest = {
      recipient,
      text,
      sender_name: conversation.sender,
    };
  }

  // Send each line as a separate message
  const sentMessages = [];
  for (const line of byLine) {
    const lineRequest = {
      ...sendRequest,
      text: line,
    };

    logger?.info(
      {
        sendRequest: lineRequest,
      },
      "Sending message line via Loop Message",
    );

    const sendResponse = await loopClient.sendMessage(lineRequest);

    if (!sendResponse.success) {
      throw new Error(`Failed to send message: ${sendResponse.error}`);
    }

    sentMessages.push({
      text: line,
      loopMessageId: sendResponse.message_id,
      response: sendResponse,
    });
  }

  const messageData: NewMessage[] = [];
  const partsData: NewPart[] = [];

  for (const message of aiMessages) {
    const id = generateId();
    messageData.push({
      id,
      conversationId,
      userId: null,
      isOutbound: true,
      rawPayload: message,
    });
    for (const part of message.parts) {
      partsData.push({
        messageId: id,
        type: part.type,
        content: part,
        order: 0,
      });
    }
  }

  // Save to database
  const insertedMessages = await db
    .insert(messages)
    .values(messageData)
    .returning();
  const insertedParts = await db.insert(parts).values(partsData).returning();

  logger?.info(
    {
      insertedMessageIds: insertedMessages.map((m) => m.id),
      conversationId,
      loopMessageIds: sentMessages.map((m) => m.loopMessageId),
    },
    "Sent and saved assistant message with multiple parts",
  );

  return {
    success: true,
    loopMessageIds: sentMessages.map((m) => m.loopMessageId),
    conversationId,
    parts: insertedParts,
  };
};
