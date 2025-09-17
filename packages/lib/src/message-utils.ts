import { Message, Part, NewMessage, NewPart } from '@poppy/db';
import type { UIMessage, UIMessagePart } from 'ai';

/**
 * Convert a database message with its parts to a UIMessage
 */
export function dbMessageToUIMessage(
  message: Message,
  messageParts: Part[]
): UIMessage {
  // Sort parts by order
  const sortedParts = messageParts.sort((a, b) => a.order - b.order);

  // Convert DB parts to UI parts
  const uiParts: UIMessagePart<any, any>[] = sortedParts.map(part => {
    // The content is stored as JSON, which includes the part type and data
    const content = part.content as any;

    // Remove rawPayload from content if it exists (we store it separately)
    const { rawPayload, ...partContent } = content;

    return partContent as UIMessagePart<any, any>;
  });

  // Extract role from the raw payload or default to 'user'
  const rawPayload = message.rawPayload as any;
  const role = rawPayload?.role || 'user';

  return {
    id: message.id,
    role,
    parts: uiParts,
  };
}

/**
 * Convert a UIMessage to database format (message and parts)
 */
export function uiMessageToDBFormat(
  uiMessage: UIMessage,
  conversationId: string,
  rawPayload?: unknown,
  isOutbound: boolean = false
): { message: NewMessage; parts: NewPart[] } {
  const messageData: NewMessage = {
    id: uiMessage.id,
    conversationId,
    isOutbound,
    rawPayload: rawPayload || { role: uiMessage.role },
  };

  const partsData: NewPart[] = uiMessage.parts.map((part, index) => ({
    messageId: uiMessage.id,
    type: part.type,
    content: {
      ...part,
      // Include raw payload with the first part if provided
      ...(index === 0 && rawPayload ? { rawPayload } : {}),
    },
    order: index,
  }));

  return {
    message: messageData,
    parts: partsData,
  };
}

/**
 * Convert multiple database messages to UIMessages
 */
export function dbMessagesToUIMessages(
  messagesWithParts: Array<{
    message: Message;
    parts: Part[];
  }>
): UIMessage[] {
  return messagesWithParts.map(({ message, parts }) =>
    dbMessageToUIMessage(message, parts)
  );
}