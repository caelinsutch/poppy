import type { Message, NewMessage, NewPart, Part } from "@poppy/db";
import type { ModelMessage, UIMessage, UIMessagePart } from "ai";

/**
 * Convert a database message with its parts to a UIMessage
 */
export const dbMessageToUIMessage = (
  message: Message,
  messageParts: Part[],
  isGroup?: boolean,
): UIMessage => {
  // Sort parts by order
  const sortedParts = messageParts.sort((a, b) => a.order - b.order);

  // Convert DB parts to UI parts
  const uiParts: UIMessagePart<any, any>[] = sortedParts.map((part, index) => {
    // The content is stored as JSON, which includes the part type and data
    const content = part.content as any;

    // Remove rawPayload from content if it exists (we store it separately)
    const { rawPayload, ...partContent } = content;

    // For group messages, prepend user ID to the first text part
    if (
      isGroup &&
      message.userId &&
      index === 0 &&
      partContent.type === "text"
    ) {
      return {
        ...partContent,
        text: `${message.userId}: ${partContent.text}`,
      } as UIMessagePart<any, any>;
    }

    return partContent as UIMessagePart<any, any>;
  });

  // Extract role from the raw payload or default to 'user'
  const rawPayload = message.rawPayload as any;
  const role = rawPayload?.role || "user";

  return {
    id: message.id,
    role,
    parts: uiParts,
  };
};

/**
 * Convert a UIMessage to database format (message and parts)
 */
export const uiMessageToDBFormat = (
  uiMessage: UIMessage,
  conversationId: string,
  rawPayload?: unknown,
  isOutbound: boolean = false,
): { message: NewMessage; parts: NewPart[] } => {
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
      ...(index === 0 && rawPayload ? { rawPayload } : {}),
    },
    order: index,
  }));

  return {
    message: messageData,
    parts: partsData,
  };
};

/**
 * Convert multiple database messages to UIMessages
 */
export const dbMessagesToUIMessages = (
  messagesWithParts: Array<{
    message: Message;
    parts: Part[];
  }>,
  isGroup?: boolean,
): UIMessage[] =>
  messagesWithParts.map(({ message, parts }) =>
    dbMessageToUIMessage(message, parts, isGroup),
  );

/**
 * Convert a database message with its parts to a ModelMessage (AI SDK format)
 */
export const dbMessageToModelMessage = (
  message: Message,
  messageParts: Part[],
  isGroup?: boolean,
): ModelMessage => {
  // Sort parts by order
  const sortedParts = messageParts.sort((a, b) => a.order - b.order);

  // Extract role from rawPayload or determine from isOutbound
  const rawPayload = message.rawPayload as any;
  const role = rawPayload?.role || (message.isOutbound ? "assistant" : "user");

  // Build content array from parts
  const content = sortedParts.map((part, index) => {
    const partContent = part.content as any;
    const { rawPayload: _, ...cleanContent } = partContent;

    // For group messages, prepend user ID to the first text part
    if (
      isGroup &&
      message.userId &&
      index === 0 &&
      cleanContent.type === "text"
    ) {
      return {
        type: "text",
        text: `${message.userId}: ${cleanContent.text}`,
      };
    }

    return cleanContent;
  });

  return {
    role,
    content,
  };
};

/**
 * Convert multiple database messages to ModelMessages (AI SDK format)
 */
export const dbMessagesToModelMessages = (
  messagesWithParts: Array<{
    message: Message;
    parts: Part[];
  }>,
  isGroup?: boolean,
): ModelMessage[] =>
  messagesWithParts.map(({ message, parts }) =>
    dbMessageToModelMessage(message, parts, isGroup),
  );
