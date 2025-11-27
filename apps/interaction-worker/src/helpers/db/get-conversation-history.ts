import {
  type Conversation,
  conversationParticipants,
  conversations,
  type Message,
  messages,
  type Part,
  parts,
  type User,
  users,
} from "@poppy/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { createModuleLogger } from "../logger";

const logger = createModuleLogger("get-conversation-history");

export const getConversationHistory = async (
  db: Database,
  conversationId: string,
) => {
  // Fetch conversation with all related data in a single query
  // IMPORTANT: Only fetch user-facing messages (exclude agent-to-agent messages)
  // Agent messages have fromAgentId or toAgentId set
  const result = await db
    .select({
      conversation: conversations,
      message: messages,
      part: parts,
      participant: users,
    })
    .from(conversations)
    .leftJoin(
      messages,
      and(
        eq(messages.conversationId, conversations.id),
        // Exclude agent messages - only get user messages and Poppy replies
        isNull(messages.fromAgentId),
        isNull(messages.toAgentId),
      ),
    )
    .leftJoin(parts, eq(parts.messageId, messages.id))
    .leftJoin(
      conversationParticipants,
      eq(conversationParticipants.conversationId, conversations.id),
    )
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
        const messageParts = messageMap.get(row.message.id)?.parts ?? [];
        // Avoid duplicate parts (due to multiple participants in the join)
        if (!messageParts.some((p) => p.id === row.part?.id)) {
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

  logger.info("Fetched conversation with history, participants and parts", {
    conversationId,
    participantCount: participants.length,
    messageCount: messagesWithParts.length,
    totalParts: messagesWithParts.reduce((acc, m) => acc + m.parts.length, 0),
  });

  return {
    conversation: conversation!,
    participants,
    messages: messagesWithParts,
  };
};
