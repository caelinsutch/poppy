import type { FastifyBaseLogger } from 'fastify';
import { db, messages, parts, conversations, conversationParticipants, users, type Message, type Part, type User, type Conversation } from '@poppy/db';
import { eq } from 'drizzle-orm';

export const getConversationHistory = async (
  conversationId: string,
  logger?: FastifyBaseLogger
) => {
  // Fetch conversation with all related data in a single query
  const result = await db
    .select({
      conversation: conversations,
      message: messages,
      part: parts,
      participant: users,
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .leftJoin(parts, eq(parts.messageId, messages.id))
    .leftJoin(conversationParticipants, eq(conversationParticipants.conversationId, conversations.id))
    .leftJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversations.id, conversationId))
    .orderBy(messages.createdAt);

  // Process the results
  let conversation: Conversation | null = null;
  const messageMap = new Map<string, { message: Message; parts: Part[] }>();
  const participantMap = new Map<string, User>();

  for (const row of result) {
    // Set conversation (only once)
    if (row.conversation && !conversation) {
      conversation = row.conversation;
    }

    // Add message if exists and not already added
    if (row.message) {
      if (!messageMap.has(row.message.id)) {
        messageMap.set(row.message.id, {
          message: row.message,
          parts: [],
        });
      }

      // Add part if exists
      if (row.part) {
        const messageParts = messageMap.get(row.message.id)!.parts;
        // Avoid duplicate parts (due to multiple participants in the join)
        if (!messageParts.some(p => p.id === row.part?.id)) {
          messageParts.push(row.part);
        }
      }
    }

    // Add participant if exists and not already added
    if (row.participant && !participantMap.has(row.participant.id)) {
      participantMap.set(row.participant.id, row.participant);
    }
  }

  const messagesWithParts = Array.from(messageMap.values());
  const participants = Array.from(participantMap.values());

  logger?.info({
    conversationId,
    participantCount: participants.length,
    messageCount: messagesWithParts.length,
    totalParts: messagesWithParts.reduce((acc, m) => acc + m.parts.length, 0),
  }, 'Fetched conversation with history, participants and parts');

  return {
    conversation: conversation!,
    participants,
    messages: messagesWithParts,
  };
};