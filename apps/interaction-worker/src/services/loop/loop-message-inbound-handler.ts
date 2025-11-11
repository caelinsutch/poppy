import type { LoopMessageInboundPayload } from "@poppy/schemas";
import type { Env } from "hono";
import type { WorkerEnv } from "../../context";
import type { Database } from "../../db/client";
import type { MessageDebouncer } from "../../durable-objects/message-debouncer";
import { getConversationHistory } from "../../helpers/db/get-conversation-history";
import { DODebouncer } from "../../helpers/do-debouncer";
import { processMessage } from "../process-message/process-message";
import { storeLoopMessages } from "./store-loop-messages";

export interface MessageInboundHandlerOptions {
  payload: LoopMessageInboundPayload;
  rawPayload: unknown;
  doNamespace: DurableObjectNamespace<MessageDebouncer>;
  db: Database;
  ctx: ExecutionContext;
  env: WorkerEnv;
}

const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const handleMessageInbound = async (
  options: MessageInboundHandlerOptions,
): Promise<void> => {
  const { payload, doNamespace, db, ctx, env } = options;

  if (payload.alert_type !== "message_inbound") {
    throw new Error(
      `Invalid alert type for inbound handler: ${payload.alert_type}`,
    );
  }

  console.log("Handling message inbound", { payload });

  const debounceTime = 4000; // 4 seconds debounce window

  // Create debouncer keyed by thread or sender_name and recipient
  const senderName = payload.sender_name ?? "unknown";
  const recipient = payload.recipient ?? "unknown";
  const groupId = payload.group?.group_id ?? "";
  const conversationId = senderName + recipient + groupId;
  const debouncer = new DODebouncer(doNamespace, conversationId);

  // Add message to debouncer
  await debouncer.addMessage(payload, debounceTime);

  console.log("Added message to debouncer", {
    conversationId,
    recipient: payload.sender_name,
    messageId: payload.message_id,
    threadId: payload.thread_id,
  });

  // Wait for debounce window minus a small buffer
  await waitFor(debounceTime - 500);

  console.log("Debounce wait completed, checking for additional messages");

  // Get all debounced messages
  const debouncedMessages = await debouncer.getMessages();

  console.log("Retrieved debounced messages", {
    messageCount: debouncedMessages.length,
    messageIds: debouncedMessages.map((m) => m.message_id),
  });

  // Check if we're the last message (should process)
  const lastMessage = debouncedMessages[debouncedMessages.length - 1];

  if (lastMessage.message_id !== payload.message_id) {
    console.log("Skipping message processing - newer message exists", {
      currentMessageId: payload.message_id,
      latestMessageId: lastMessage.message_id,
    });
    return;
  }

  try {
    // Store all debounced messages in the database
    const storedData = await storeLoopMessages(db, debouncedMessages);

    if (storedData) {
      // Fetch full conversation with history, participants and parts
      const {
        conversation,
        messages: conversationHistory,
        participants,
      } = await getConversationHistory(db, storedData.message.conversationId);

      console.log("Fetched conversation context", {
        conversationId: conversation.id,
        messageCount: conversationHistory.length,
        participantCount: participants.length,
      });

      // Process with AI agent
      await processMessage({
        currentMessage: storedData.message,
        currentParts: storedData.parts,
        conversation,
        conversationHistory,
        participants,
        env,
        db,
      });
    }

    // Clear the debouncer after successful processing
    await debouncer.clear();

    console.log("Successfully processed debounced messages", {
      messageCount: debouncedMessages.length,
    });
  } catch (error) {
    console.error("Failed to process debounced messages", { error, payload });
    throw error;
  }
};
