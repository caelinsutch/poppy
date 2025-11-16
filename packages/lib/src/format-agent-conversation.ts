import type { Agent, Message, Part } from "@poppy/db";

export interface AgentMessageItem {
  fromAgent: Agent;
  toAgent: Agent;
  message: Message;
  parts: Part[];
}

export interface FormatAgentConversationOptions {
  conversationHistory: Array<{
    message: Message;
    parts: Part[];
  }>;
  agentMessages: AgentMessageItem[];
  currentMessage?: {
    message: Message;
    parts: Part[];
  };
  currentAgentMessage?: AgentMessageItem;
  isGroup?: boolean;
}

/**
 * Format a conversation in XML structure for agent processing
 * Follows the structure: <conversation_history>, <new_user_message>, <new_agent_message>
 */
export const formatAgentConversation = (
  options: FormatAgentConversationOptions,
): string => {
  const {
    conversationHistory,
    agentMessages,
    currentMessage,
    currentAgentMessage,
    isGroup,
  } = options;

  // Merge and sort all messages by timestamp
  const allItems: Array<{
    type: "user_message" | "poke_reply" | "agent_message";
    timestamp: Date;
    content: string;
  }> = [];

  // Add conversation history (user messages and bot replies)
  for (const item of conversationHistory) {
    const type = item.message.isOutbound ? "poke_reply" : "user_message";
    const content = formatMessageContent(item.message, item.parts, isGroup);

    allItems.push({
      type,
      timestamp: item.message.createdAt,
      content,
    });
  }

  // Add agent messages
  for (const agentMsg of agentMessages) {
    const content = formatAgentMessageContent(agentMsg);

    allItems.push({
      type: "agent_message",
      timestamp: agentMsg.message.createdAt,
      content,
    });
  }

  // Sort by timestamp
  allItems.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Build conversation history
  let formatted = "<conversation_history>\n";

  for (const item of allItems) {
    if (item.type === "user_message") {
      formatted += `<user_message>\n${item.content}\n</user_message>\n\n`;
    } else if (item.type === "poke_reply") {
      formatted += `<poke_reply>\n${item.content}\n</poke_reply>\n\n`;
    } else if (item.type === "agent_message") {
      formatted += `<agent_message>\n${item.content}\n</agent_message>\n\n`;
    }
  }

  formatted += "</conversation_history>\n\n";

  // Add current message
  if (currentMessage) {
    const content = formatMessageContent(
      currentMessage.message,
      currentMessage.parts,
      isGroup,
    );
    formatted += `<new_user_message>\n${content}\n</new_user_message>`;
  } else if (currentAgentMessage) {
    const content = formatAgentMessageContent(currentAgentMessage);
    formatted += `<new_agent_message>\n${content}\n</new_agent_message>`;
  }

  return formatted;
};

/**
 * Format a regular message (user or bot) content
 */
export const formatMessageContent = (
  message: Message,
  parts: Part[],
  isGroup?: boolean,
): string => {
  const sortedParts = [...parts].sort((a, b) => a.order - b.order);

  let content = "";

  for (let i = 0; i < sortedParts.length; i++) {
    const part = sortedParts[i];
    const partContent = part.content as any;

    if (partContent.type === "text") {
      // For group messages, include user ID prefix on first part
      if (isGroup && message.userId && i === 0) {
        content += `${message.userId}: ${partContent.text}`;
      } else {
        content += partContent.text;
      }
    } else if (partContent.type === "image") {
      content += `[Image: ${partContent.image || "attached"}]`;
    } else {
      // Handle other part types
      content += `[${partContent.type}]`;
    }

    // Add spacing between parts if needed
    if (i < sortedParts.length - 1 && partContent.type === "text") {
      content += " ";
    }
  }

  return content.trim();
};

/**
 * Format an agent message content
 * Format: agent_purpose: message_content
 */
export const formatAgentMessageContent = (
  agentMsg: AgentMessageItem,
): string => {
  const { fromAgent, message, parts } = agentMsg;

  // Get a short agent name from purpose (first word or "execution_agent")
  const agentName = fromAgent.purpose?.split(" ")[0] || "execution_agent";

  // Get message content
  const messageContent = formatMessageContent(message, parts, false);

  return `${agentName}: ${messageContent}`;
};
