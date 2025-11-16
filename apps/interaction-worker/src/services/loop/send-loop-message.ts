import {
  conversationParticipants,
  conversations,
  messages,
  type NewMessage,
  type NewPart,
  parts,
  users,
} from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import type { LoopMessageSendRequest } from "@poppy/schemas";
import { generateId } from "ai";
import { eq } from "drizzle-orm";
import { loopClient } from "../../clients/loop-message";
import type { Database } from "../../db/client";

export interface SendLoopMessageOptions {
  text: string;
  conversationId: string;
  db: Database;
}

export const sendLoopMessage = async (options: SendLoopMessageOptions) => {
  const { text, conversationId, db } = options;

  logger
    .withTags({ conversationId })
    .info("Sending Loop message", {
      textLength: text.length,
      textPreview: text.substring(0, 100),
    });

  const byLine = text.split("\n").filter((line) => line.trim());

  logger
    .withTags({ conversationId })
    .info("Split message into lines", {
      lineCount: byLine.length,
    });

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
    logger
      .withTags({ conversationId })
      .error("Conversation not found");
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const conversation = result[0].conversation;
  const participants = result
    .map((r) => r.phoneNumber)
    .filter((p): p is string => p !== null);

  logger
    .withTags({ conversationId })
    .info("Fetched conversation and participants", {
      participantCount: participants.length,
      isGroup: !!conversation.loopMessageGroupId,
      sender: conversation.sender,
    });

  // Build the request based on whether it's a group or individual conversation
  let sendRequest: LoopMessageSendRequest;

  if (conversation.loopMessageGroupId) {
    // Group message - use group_id
    sendRequest = {
      group: conversation.loopMessageGroupId,
      text,
      sender_name: conversation.sender,
    };
    logger
      .withTags({ conversationId })
      .info("Sending as group message", {
        groupId: conversation.loopMessageGroupId,
      });
  } else {
    // Individual message - find the recipient (participant who is NOT the sender/bot)
    const recipient = participants.find((p) => p !== conversation.sender);

    if (!recipient) {
      logger
        .withTags({ conversationId })
        .error("Could not determine recipient", {
          participants,
          sender: conversation.sender,
        });
      throw new Error(
        `Could not determine recipient for conversation: ${conversationId}`,
      );
    }

    sendRequest = {
      recipient,
      text,
      sender_name: conversation.sender,
    };
    logger
      .withTags({ conversationId })
      .info("Sending as individual message", {
        recipient,
      });
  }

  // Send each line as a separate message
  const loopMessageIds: string[] = [];
  for (const line of byLine) {
    logger
      .withTags({ conversationId })
      .info("Sending line via Loop", {
        lineLength: line.length,
        linePreview: line.substring(0, 50),
      });

    const response = await loopClient.sendMessage({
      ...sendRequest,
      text: line,
    });

    if (response.success && response.message_id) {
      loopMessageIds.push(response.message_id);
      logger
        .withTags({ conversationId })
        .info("Successfully sent Loop message", {
          messageId: response.message_id,
        });
    } else {
      logger
        .withTags({ conversationId })
        .error("Failed to send Loop message", {
          error: response.error,
          linePreview: line.substring(0, 50),
        });
      throw new Error(`Failed to send Loop message: ${response.error}`);
    }
  }

  logger
    .withTags({ conversationId })
    .info("Sent all Loop messages", {
      loopMessageIds,
      lineCount: byLine.length,
    });

  // Save the sent message to the database
  const messageId = generateId();
  const now = new Date();

  const newMessage: NewMessage = {
    id: messageId,
    conversationId,
    isOutbound: true,
    createdAt: now,
    rawPayload: {
      type: "ai_response",
      text,
    },
  };

  const newParts: NewPart[] = [
    {
      id: generateId(),
      messageId,
      type: "text",
      content: {
        type: "text",
        text: text,
      },
      createdAt: now,
      order: 0,
    },
  ];

  await db.transaction(async (tx) => {
    await tx.insert(messages).values(newMessage);
    await tx.insert(parts).values(newParts);
  });

  logger
    .withTags({ conversationId, messageId })
    .info("Saved outbound message to database", {
      partsCount: newParts.length,
    });

  return {
    messageId,
    loopMessageIds,
    conversationId,
  };
};
