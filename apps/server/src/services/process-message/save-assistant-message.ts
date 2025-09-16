import type { FastifyBaseLogger } from 'fastify';
import type { UIMessage } from 'ai';
import { db, messages, parts } from '@poppy/db';
import { eq } from 'drizzle-orm';
import { uiMessageToDBFormat } from '@poppy/lib';

export interface SaveAssistantMessageOptions {
  assistantMessage: UIMessage;
  conversationId: string;
  channelId: string;
  loopMessageId?: string;
  sender?: string;
  recipient?: string;
  logger?: FastifyBaseLogger;
}

export const saveAssistantMessage = async (options: SaveAssistantMessageOptions) => {
  const {
    assistantMessage,
    conversationId,
    channelId,
    loopMessageId,
    sender,
    recipient,
    logger
  } = options;

  // Convert UIMessage to DB format
  const { message: dbMessage, parts: dbParts } = uiMessageToDBFormat(
    assistantMessage,
    conversationId,
    channelId,
    { loopMessageId }, // Store metadata in raw payload
    sender,
    recipient,
    true // isOutbound = true for assistant messages
  );

  // Save the assistant message to database
  // Insert message first (due to foreign key constraint)
  const [insertedMessage] = await db.insert(messages).values(dbMessage).returning();
  const insertedParts = await db.insert(parts).values(dbParts).returning();

  logger?.info({
    assistantMessageId: assistantMessage.id,
    conversationId,
    channelId,
  }, 'Saved assistant response to database');

  return {
    message: insertedMessage,
    parts: insertedParts,
  };
};

export const updateMessageWithLoopId = async (
  messageId: string,
  loopMessageId: string,
  logger?: FastifyBaseLogger
) => {
  const [existingMessage] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!existingMessage) {
    throw new Error(`Message not found: ${messageId}`);
  }

  await db
    .update(messages)
    .set({
      rawPayload: {
        ...(existingMessage.rawPayload as any),
        loopMessageId,
      },
    })
    .where(eq(messages.id, messageId));

  logger?.info({
    messageId,
    loopMessageId,
  }, 'Updated message with Loop Message ID');
};