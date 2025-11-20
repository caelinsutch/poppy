import { DurableObject } from "cloudflare:workers";
import type { LoopMessageInboundPayload } from "@poppy/schemas";
import type { WorkerEnv } from "../context";
import { createModuleLogger } from "../helpers/logger";

const logger = createModuleLogger("message-debouncer");

interface MessageEntry {
  messages: LoopMessageInboundPayload[];
  timeoutId: number | null;
}

export class MessageDebouncer extends DurableObject {
  private messageEntries: Map<string, MessageEntry>;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.messageEntries = new Map();
  }

  async addMessage(
    conversationId: string,
    message: LoopMessageInboundPayload,
    debounceMs: number,
  ): Promise<{
    shouldProcess: boolean;
    messages: LoopMessageInboundPayload[];
  }> {
    logger.info("Adding message to Durable Object debouncer", {
      conversationId,
      messageId: message.message_id,
    });

    // Get or create entry for this conversation
    let entry = this.messageEntries.get(conversationId);

    if (!entry) {
      entry = {
        messages: [],
        timeoutId: null,
      };
      this.messageEntries.set(conversationId, entry);
    }

    // Add message to the list
    entry.messages.push(message);

    // Clear existing timeout if any
    if (entry.timeoutId !== null) {
      clearTimeout(entry.timeoutId);
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      this.processConversation(conversationId);
    }, debounceMs) as unknown as number;

    entry.timeoutId = timeoutId;

    return {
      shouldProcess: false,
      messages: [...entry.messages],
    };
  }

  async getMessages(
    conversationId: string,
  ): Promise<LoopMessageInboundPayload[]> {
    const entry = this.messageEntries.get(conversationId);
    return entry ? [...entry.messages] : [];
  }

  async clearMessages(conversationId: string): Promise<void> {
    const entry = this.messageEntries.get(conversationId);
    if (entry && entry.timeoutId !== null) {
      clearTimeout(entry.timeoutId);
    }
    this.messageEntries.delete(conversationId);
  }

  private processConversation(conversationId: string): void {
    // This will be called after the debounce timeout
    // The actual processing happens in the worker, not here
    logger.info("Debounce timeout completed for conversation", {
      conversationId,
    });
  }
}
