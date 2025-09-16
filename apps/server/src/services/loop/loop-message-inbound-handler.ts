import type { LoopMessageWebhookPayload } from '@poppy/schemas';
import type { FastifyBaseLogger } from 'fastify';
import type { UIMessage, TextPart } from 'ai';
import { db, messages, parts, conversations, conversationParticipants, userChannels, users, type Message, type Part, type NewPart } from '@poppy/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { generateId } from 'ai';
import { SmsDebouncer } from '../../helpers/sms-debouncer';
import { processMessage } from '../process-message';

export interface MessageInboundHandlerOptions {
  payload: LoopMessageWebhookPayload;
  rawPayload: unknown;
  logger?: FastifyBaseLogger;
}

const waitFor = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const getConversationHistory = async (
  conversationId: string,
  logger?: FastifyBaseLogger
): Promise<{ message: Message; parts: Part[] }[]> => {
  // Fetch all messages in the conversation with their parts
  const conversationMessages = await db
    .select({
      message: messages,
      parts: parts,
    })
    .from(messages)
    .leftJoin(parts, eq(parts.messageId, messages.id))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  // Group parts by message
  const messageMap = new Map<string, { message: Message; parts: Part[] }>();

  for (const row of conversationMessages) {
    if (!row.message) continue;

    if (!messageMap.has(row.message.id)) {
      messageMap.set(row.message.id, {
        message: row.message,
        parts: [],
      });
    }

    if (row.parts) {
      messageMap.get(row.message.id)!.parts.push(row.parts);
    }
  }

  const messagesWithParts = Array.from(messageMap.values());

  logger?.info({
    conversationId,
    messageCount: messagesWithParts.length,
    totalParts: messagesWithParts.reduce((acc, m) => acc + m.parts.length, 0),
  }, 'Fetched conversation history with parts');

  return messagesWithParts;
};

const storeMessages = async (
  payloads: LoopMessageWebhookPayload[],
  logger?: FastifyBaseLogger,
): Promise<{ message: Message; parts: Part[]; channelId: string } | null> => {
  if (payloads.length === 0) {
    logger?.warn('No messages to store');
    return null;
  }

  // Use the first payload for channel/conversation lookup
  const primaryPayload = payloads[0];
  console.log('primaryPayload', primaryPayload);

  // Step 1: Extract the UI message with associated parts
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
    // Step 2: Create users for each person in conversation
    // Determine if this is a group message and extract group ID
    let loopMessageGroupId: string | undefined;
    const participants = new Set<string>();

    if (primaryPayload.alert_type === 'group_created') {
      // For group_created, extract group ID and participants
      const groupPayload = primaryPayload as any;
      if (groupPayload.group) {
        loopMessageGroupId = groupPayload.group.group_id;
        if (groupPayload.group.participants) {
          groupPayload.group.participants.forEach((p: string) => participants.add(p));
        }
      }
    } else if (primaryPayload.alert_type === 'message_inbound' && primaryPayload.thread_id?.startsWith('group:')) {
      if (primaryPayload.recipient) {
        participants.add(primaryPayload.recipient);
      }
      participants.add(primaryPayload.recipient);
    } else {
      // For regular 1-on-1 messages
      if (primaryPayload.recipient) {
        participants.add(primaryPayload.recipient);
      }
      participants.add(primaryPayload.recipient);
    }

    const isGroupMessage = !!loopMessageGroupId;

    const participantArray = Array.from(participants);

    // Batch lookup all users at once
    const existingUsers = await db
      .select()
      .from(users)
      .where(inArray(users.phoneNumber, participantArray));

    const userMap = new Map<string, string>();
    existingUsers.forEach(user => userMap.set(user.phoneNumber, user.id));

    // Find missing users
    const missingUsers = participantArray.filter(p => !userMap.has(p));

    // Batch create missing users
    if (missingUsers.length > 0) {
      const newUsers = await db
        .insert(users)
        .values(missingUsers.map(phoneNumber => ({ phoneNumber })))
        .returning();

      newUsers.forEach(user => userMap.set(user.phoneNumber, user.id));
      logger?.info({ count: newUsers.length, phoneNumbers: missingUsers }, 'Created new users');
    }

    // Parallel fetch: channel and conversation
    const [channelResult, conversationResult] = await Promise.all([
      // Find or create channel
      db.select().from(userChannels)
        .where(eq(userChannels.channelIdentifier, primaryPayload.recipient))
        .limit(1),
      // Check for existing conversation (will refine after we have channel)
      db.select().from(conversations)
        .where(eq(conversations.channelId, sql`NULL`)) // Placeholder, will be updated
        .limit(0) // Don't actually run this yet
    ]);

    let channel = channelResult[0];

    if (!channel) {
      const recipientUserId = userMap.get(primaryPayload.recipient);
      if (!recipientUserId) {
        throw new Error(`User not found for recipient: ${primaryPayload.recipient}`);
      }

      [channel] = await db
        .insert(userChannels)
        .values({
          userId: recipientUserId,
          channelType: "sms",
          channelIdentifier: primaryPayload.recipient,
        })
        .returning();

      logger?.info({ channelId: channel.id, userId: recipientUserId }, 'Created new user channel');
    }

    // Step 3: Create the conversation and conversationParticipants rows
    let conversationId: string;

    // Look for existing conversation
    const existingConversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.channelId, channel.id))
      .limit(1);

    if (existingConversation.length > 0) {
      conversationId = existingConversation[0].id;

      // Batch check existing participants
      const existingParticipants = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            inArray(conversationParticipants.userId, Array.from(userMap.values()))
          )
        );

      const existingUserIds = new Set(existingParticipants.map(p => p.userId));
      const newParticipants = Array.from(userMap.values())
        .filter(userId => !existingUserIds.has(userId))
        .map(userId => ({
          conversationId,
          userId,
        }));

      if (newParticipants.length > 0) {
        await db
          .insert(conversationParticipants)
          .values(newParticipants)
          .onConflictDoNothing(); // Handle race conditions

        logger?.info({ conversationId, count: newParticipants.length }, 'Added new participants to conversation');
      }
    } else {
      // Create new conversation with all participants in a transaction
      const result = await db.transaction(async (tx) => {
        const conversationData: any = {
          channelId: channel.id,
          isGroup: isGroupMessage,
          sender: primaryPayload.sender_name,
        };

        logger?.info({
          conversationData,
        }, 'Creating new conversation');

        // Only add loopMessageGroupId if it's defined (for group conversations)
        if (loopMessageGroupId) {
          conversationData.loopMessageGroupId = loopMessageGroupId;
        }

        const [newConversation] = await tx
          .insert(conversations)
          .values(conversationData)
          .returning();

        // Batch insert all participants
        const participantValues = Array.from(userMap.values()).map(userId => ({
          conversationId: newConversation.id,
          userId,
        }));

        await tx
          .insert(conversationParticipants)
          .values(participantValues);

        return newConversation.id;
      });

      conversationId = result;

      logger?.info({
        conversationId,
        isGroup: isGroupMessage,
        participantCount: userMap.size
      }, 'Created new conversation with participants');
    }

    // Step 4: Create the message attached to the right user
    // For incoming messages, set userId to the sender's user ID
    // Don't include userId for outbound messages
    const senderUserId = primaryPayload.recipient
      ? userMap.get(primaryPayload.recipient)
      : undefined;

    // Convert UIMessage to DB format (without sender/recipient as those aren't in the schema)
    const messageData = {
      id: uiMessage.id,
      conversationId,
      channelId: channel.id,
      userId: senderUserId, // Set userId for incoming messages (sender's ID)
      isOutbound: false, // This is an inbound message
      rawPayload: primaryPayload,
    };

    const partsData: NewPart[] = uiMessage.parts.map((part, index) => ({
      messageId: uiMessage.id,
      type: part.type,
      content: {
        ...part,
        // Include raw payload with the first part if provided
        ...(index === 0 ? { rawPayload: primaryPayload } : {}),
      },
      order: index,
    }));

    // Insert message first, then parts (due to foreign key constraint)
    const [insertedMessage] = await db.insert(messages).values(messageData).returning();
    const insertedParts = await db.insert(parts).values(partsData).returning();

    logger?.info({
      messageId: uiMessage.id,
      conversationId,
      channelId: channel.id,
      senderUserId,
      isOutbound: false,
      isGroup: isGroupMessage,
      participantCount: userMap.size,
    }, 'Successfully stored inbound message');

    return {
      message: insertedMessage,
      parts: insertedParts,
      channelId: channel.id
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
    const storedData = await storeMessages(debouncedMessages, logger);
    if (storedData) {
      // Fetch full conversation history with parts
      const conversationHistory = await getConversationHistory(
        storedData.message.conversationId,
        logger
      );

      await processMessage({
        currentMessage: storedData.message,
        currentParts: storedData.parts,
        conversationHistory,
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