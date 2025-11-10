import type { LoopMessageInboundPayload } from "@poppy/schemas";
import type { MessageDebouncer } from "../durable-objects/message-debouncer";

export class DODebouncer {
  private readonly stub: DurableObjectStub<MessageDebouncer>;
  private readonly conversationId: string;

  constructor(
    doNamespace: DurableObjectNamespace<MessageDebouncer>,
    conversationId: string,
  ) {
    this.conversationId = conversationId;
    // Create a deterministic ID from the conversation
    const id = doNamespace.idFromName(conversationId);
    this.stub = doNamespace.get(id);
  }

  async addMessage(
    message: LoopMessageInboundPayload,
    debounceMs: number,
  ): Promise<{
    shouldProcess: boolean;
    messages: LoopMessageInboundPayload[];
  }> {
    return await this.stub.addMessage(this.conversationId, message, debounceMs);
  }

  async getMessages(): Promise<LoopMessageInboundPayload[]> {
    return await this.stub.getMessages(this.conversationId);
  }

  async clear(): Promise<void> {
    await this.stub.clearMessages(this.conversationId);
  }
}
