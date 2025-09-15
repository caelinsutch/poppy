import type { LoopMessageWebhookPayload } from '@poppy/schemas';
import type { FastifyBaseLogger } from 'fastify';
import type { UIMessage, TextPart } from 'ai';
import { db, messages, parts, conversations, userChannels, users, channelType, type NewMessage, type Part } from '@poppy/db';
import { eq, and } from 'drizzle-orm';
import { generateId } from 'ai';
import { uiMessageToDBFormat } from '@poppy/lib';
import { SmsDebouncer } from '../helpers/sms-debouncer';
import { processMessage } from './process-message';

export interface MessageInboundHandlerOptions {
  payload: LoopMessageWebhookPayload;
  rawPayload: unknown;
  logger?: FastifyBaseLogger;
}

const waitFor = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const storeMessages = async (
  payloads: LoopMessageWebhookPayload[],
  logger?: FastifyBaseLogger
): Promise<{ message: NewMessage; parts: Part[] } | null> => {
  if (payloads.length === 0) {
    logger?.warn('No messages to store');
    return null;
  }

  // Use the first payload for channel/conversation lookup
  const primaryPayload = payloads[0];

  // Combine all payloads into a single UIMessage with multiple parts
  const messageParts: TextPart[] = payloads.map(payload => ({
    type: 'text' as const,
    text: payload.text,
  }));

  const uiMessage: UIMessage = {
    id: generateId(),
    role: 'user',
    parts: messageParts,
  };

  logger?.info({
    messageData: {
      id: uiMessage.id,
      role: uiMessage.role,
      parts: uiMessage.parts,
      messageCount: payloads.length,
    }
  }, 'Storing debounced inbound messages');

  try {
    // Find or create a user channel for this recipient
    let [channel] = await db
      .select()
      .from(userChannels)
      .where(eq(userChannels.channelIdentifier, primaryPayload.recipient))
      .limit(1);

    if (!channel) {
      logger?.info({ recipient: primaryPayload.recipient }, 'Creating new user channel for recipient');

      // First, find or create a user for this phone number
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, primaryPayload.recipient))
        .limit(1);

      if (!user) {
        // Create a new user
        [user] = await db
          .insert(users)
          .values({
            phoneNumber: primaryPayload.recipient,
          })
          .returning();

        logger?.info({ userId: user.id, phoneNumber: primaryPayload.recipient }, 'Created new user');
      }

      // Create a new channel for this user
      [channel] = await db
        .insert(userChannels)
        .values({
          userId: user.id,
          channelType: channelType.enumValues[0], // Use 'imessage' or appropriate type
          channelIdentifier: primaryPayload.recipient,
        })
        .returning();

      logger?.info({ channelId: channel.id, userId: user.id }, 'Created new user channel');
    }

    // Find or create a conversation
    let conversationId: string;
    const existingConversation = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.channelId, channel.id),
          // You might want to add more conditions here based on thread_id
        )
      )
      .limit(1);

    if (existingConversation.length > 0) {
      conversationId = existingConversation[0].id;
    } else {
      // Create a new conversation
      const [newConversation] = await db
        .insert(conversations)
        .values({
          userIds: [channel.userId], // Store as JSON array
          channelId: channel.id,
        })
        .returning();

      conversationId = newConversation.id;
      logger?.info({ conversationId }, 'Created new conversation');
    }

    // Convert UIMessage to DB format
    const { message, parts: partsData } = uiMessageToDBFormat(
      uiMessage,
      conversationId,
      channel.id,
      primaryPayload // Pass the primary webhook payload
    );

    // Parallelize message and parts insertion
    const [insertedMessages, insertedParts] = await Promise.all([
      db.insert(messages).values(message).returning(),
      db.insert(parts).values(partsData).returning(),
    ]);

    logger?.info({
      messageId: uiMessage.id,
      conversationId,
      channelId: channel.id
    }, 'Successfully stored inbound message');

    return {
      message: insertedMessages[0],
      parts: insertedParts
    };

  } catch (error) {
    logger?.error({ error, payloads }, 'Failed to store messages in database');
    throw error;
  }
};


export const handleMessageInbound = async (options: MessageInboundHandlerOptions): Promise<void> => {
  const { payload, logger } = options;

  if (payload.alert_type !== 'message_inbound') {
    throw new Error(`Invalid alert type for inbound handler: ${payload.alert_type}`);
  }

  const debounceTime = 4000; // 4 seconds debounce window

  // Create debouncer keyed by thread or sender_name and recipient
  // For inbound messages, we use thread_id if available, otherwise sender_name or a default
  const senderKey = payload.thread_id || payload.sender_name || 'unknown';
  const debouncer = new SmsDebouncer<LoopMessageWebhookPayload>(
    senderKey,
    payload.recipient,
    debounceTime
  );

  // Add message to debouncer
  await debouncer.addMessage(payload);

  logger?.info({
    senderKey,
    recipient: payload.recipient,
    messageId: payload.message_id,
    threadId: payload.thread_id,
  }, 'Added message to debouncer');

  // Wait for debounce window minus a small buffer
  await waitFor(debounceTime - 500);

  logger?.info('Debounce wait completed, checking for additional messages');

  // Get all debounced messages
  const debouncedMessages = await debouncer.getMessages();

  logger?.info({
    messageCount: debouncedMessages.length,
    messageIds: debouncedMessages.map(m => m.message_id),
  }, 'Retrieved debounced messages');

  // Check if we're the last message (should process)
  const lastMessage = debouncedMessages[debouncedMessages.length - 1];

  if (lastMessage.message_id !== payload.message_id) {
    logger?.info({
      currentMessageId: payload.message_id,
      latestMessageId: lastMessage.message_id,
    }, 'Skipping message processing - newer message exists in debouncer');
    return;
  }

  try {
    // Process all debounced messages together
    const storedData = await storeMessages(debouncedMessages, logger);
    if (storedData) {
      await processMessage({ ...storedData, logger });
    }

    // Clear the debouncer after successful processing
    await debouncer.clear();

    logger?.info({
      messageCount: debouncedMessages.length,
    }, 'Successfully processed all debounced messages');
  } catch (error) {
    logger?.error({ error, payload }, 'Failed to process debounced messages');
    throw error;
  }
};