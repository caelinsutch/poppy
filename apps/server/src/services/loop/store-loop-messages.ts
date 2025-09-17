import { Message, Part, db, users, conversations, conversationParticipants, NewPart, messages, parts, NewConversation } from "@poppy/db";
import { LoopMessageInboundPayload, LoopMessageWebhookPayload } from "@poppy/schemas";
import { TextPart, UIMessage, generateId } from "ai";
import { inArray, eq, sql, and } from "drizzle-orm";
import { FastifyBaseLogger } from "fastify";

export const storeLoopMessages = async (
  payloads: LoopMessageInboundPayload[],
  logger?: FastifyBaseLogger,
): Promise<{ message: Message; parts: Part[] } | null> => {
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

    // Check if this is a group message (has a group field)
    const groupPayload = primaryPayload as any;
    if (groupPayload.group) {
      // Extract group ID and participants from group messages
      loopMessageGroupId = groupPayload.group.group_id;
      if (groupPayload.group.participants) {
        groupPayload.group.participants.forEach((p: string) => participants.add(p));
      }
    } else {
      // For regular 1-on-1 messages, add recipient
      if (primaryPayload.recipient) {
        participants.add(primaryPayload.recipient);
      }
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

    // No need for channel lookup anymore - conversations are directly linked to users via participants

    // Step 3: Create the conversation and conversationParticipants rows
    let conversationId: string;

    // Look for existing conversation by checking participants
    // For 1-on-1: find conversation with exactly these participants
    // For groups: find by loopMessageGroupId if available
    let existingConversation: any[] = [];

    if (loopMessageGroupId) {
      // For group conversations, find by group ID
      existingConversation = await db
        .select()
        .from(conversations)
        .where(eq(conversations.loopMessageGroupId, loopMessageGroupId))
        .limit(1);
    } else {
      // For 1-on-1 conversations, find by matching all participants
      // Get all user IDs involved
      const userIds = Array.from(userMap.values());

      // Find conversations where all these users are participants
      const conversationsWithParticipants = await db
        .select({
          conversation: conversations,
          participantCount: sql<number>`count(distinct ${conversationParticipants.userId})`,
        })
        .from(conversations)
        .innerJoin(conversationParticipants, eq(conversationParticipants.conversationId, conversations.id))
        .where(and(
          inArray(conversationParticipants.userId, userIds),
          eq(conversations.isGroup, false)
        ))
        .groupBy(conversations.id)
        .having(sql`count(distinct ${conversationParticipants.userId}) = ${userIds.length}`);

      if (conversationsWithParticipants.length > 0) {
        existingConversation = [conversationsWithParticipants[0].conversation];
      }
    }

    if (existingConversation.length > 0) {
      conversationId = existingConversation[0].id;
    } else {
      // Create new conversation with all participants in a transaction
      const result = await db.transaction(async (tx) => {
        const conversationData: NewConversation = {
          isGroup: isGroupMessage,
          sender: primaryPayload.sender_name!,
          loopMessageGroupId,
          channelType: 'loop',
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
      senderUserId,
      isOutbound: false,
      isGroup: isGroupMessage,
      participantCount: userMap.size,
    }, 'Successfully stored inbound message');

    return {
      message: insertedMessage,
      parts: insertedParts
    };

  } catch (error) {
    logger?.error({ error, payloads }, 'Failed to store messages in database');
    throw error;
  }
};
