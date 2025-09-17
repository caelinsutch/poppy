import type { LoopMessageWebhookPayload } from '@poppy/schemas';
import type { FastifyBaseLogger } from 'fastify';
import type { UIMessage, TextPart } from 'ai';
import { db, messages, parts, conversations, conversationParticipants, users, type Message, type Part, type NewPart } from '@poppy/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { generateId } from 'ai';
import { SmsDebouncer } from '../../helpers/sms-debouncer';
import { processMessage } from '../process-message';
import { getConversationHistory } from '../../helpers/db/get-conversation-history';
import { storeLoopMessages } from './store-loop-messages';

export interface MessageInboundHandlerOptions {
  payload: LoopMessageWebhookPayload;
  rawPayload: unknown;
  logger?: FastifyBaseLogger;
}

const waitFor = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));


export const handleMessageInbound = async (options: MessageInboundHandlerOptions): Promise<void> => {
  const { payload, logger } = options;

  if (payload.alert_type !== 'message_inbound') {
    throw new Error(`Invalid alert type for inbound handler: ${payload.alert_type}`);
  }

  logger?.info({
    payload,
  }, 'Handling message inbound');

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
    recipient: payload.sender_name,
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
    const storedData = await storeLoopMessages(debouncedMessages, logger);
    if (storedData) {
      // Fetch full conversation with history, participants and parts
      const { conversation, messages: conversationHistory, participants } = await getConversationHistory(
        storedData.message.conversationId,
        logger
      );

      await processMessage({
        currentMessage: storedData.message,
        currentParts: storedData.parts,
        conversation,
        conversationHistory,
        participants,
        logger: logger as FastifyBaseLogger
      });
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