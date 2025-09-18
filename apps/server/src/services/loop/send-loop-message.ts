import { loopClient } from '../../clients/loop-message';
import { db, conversations, conversationParticipants, users, messages, parts, type NewPart } from '@poppy/db';
import { eq } from 'drizzle-orm';
import type { LoopMessageSendRequest } from '@poppy/schemas';
import type { UIMessage, TextPart } from 'ai';
import { generateId } from 'ai';
import type { FastifyBaseLogger } from 'fastify';

export interface SendLoopMessageOptions {
  text: string;
  conversationId: string;
  logger?: FastifyBaseLogger;
}

export const sendLoopMessage = async (options: SendLoopMessageOptions) => {
  const { text, conversationId, logger } = options;

  const byLine = text.split('\n').filter(line => line.trim());

  // Fetch conversation with participants in a single query
  const result = await db
    .select({
      conversation: conversations,
      phoneNumber: users.phoneNumber,
    })
    .from(conversations)
    .leftJoin(conversationParticipants, eq(conversationParticipants.conversationId, conversations.id))
    .leftJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversations.id, conversationId));

  if (!result.length || !result[0].conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const conversation = result[0].conversation;
  const participants = result
    .map(r => r.phoneNumber)
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
    const recipient = participants.find(p => p !== conversation.sender);

    if (!recipient) {
      throw new Error(`Could not determine recipient for conversation: ${conversationId}`);
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

    logger?.info({
      sendRequest: lineRequest,
    }, 'Sending message line via Loop Message');

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

  // Create the assistant message for database storage with parts from byLine
  const assistantMessage: UIMessage = {
    id: generateId(),
    role: 'assistant',
    parts: byLine.map(line => ({
      type: 'text',
      text: line,
    } as TextPart)),
  };

  // Prepare message and parts data for database
  const messageData = {
    id: assistantMessage.id,
    conversationId,
    userId: null, // Assistant messages don't have a userId
    isOutbound: true, // Assistant messages are outbound
    rawPayload: {
      role: 'assistant',
      loopMessageIds: sentMessages.map(m => m.loopMessageId),
      responses: sentMessages.map(m => m.response),
    },
  };

  const partsData: NewPart[] = assistantMessage.parts.map((part, index) => ({
    messageId: assistantMessage.id,
    type: part.type,
    content: part,
    order: index,
  }));

  // Save to database
  const [insertedMessage] = await db.insert(messages).values(messageData).returning();
  const insertedParts = await db.insert(parts).values(partsData).returning();

  logger?.info({
    assistantMessageId: assistantMessage.id,
    conversationId,
    loopMessageIds: sentMessages.map(m => m.loopMessageId),
  }, 'Sent and saved assistant message with multiple parts');

  return {
    success: true,
    loopMessageIds: sentMessages.map(m => m.loopMessageId),
    conversationId,
    message: insertedMessage,
    parts: insertedParts,
  };
};