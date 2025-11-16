import {
  conversationParticipants,
  conversations,
  messages,
  type NewMessage,
  type NewPart,
  parts,
  users,
} from "@poppy/db";
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
  const loopMessageIds: string[] = [];
  for (const line of byLine) {
    const response = await loopClient.sendMessage({
      ...sendRequest,
      text: line,
    });

    if (response.success && response.message_id) {
      loopMessageIds.push(response.message_id);
    } else {
      console.error("Failed to send Loop message", {
        error: response.error,
        line,
      });
      throw new Error(`Failed to send Loop message: ${response.error}`);
    }
  }

  console.log("Sent Loop messages", {
    conversationId,
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

  console.log("Saved outbound message to database", {
    messageId,
    conversationId,
    partsCount: newParts.length,
  });

  return {
    messageId,
    loopMessageIds,
    conversationId,
  };
};
