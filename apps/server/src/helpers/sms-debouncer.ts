import { kv } from "@vercel/kv";


interface SmsCacheEntry<T> {
  messages: T[];
  lastProcessed: string;
}

// Message-related keys
const smsDebouncerKey = (conversationId: string) =>
  `sms-debouncer:${conversationId}`;

export class SmsDebouncer<T> {
  private readonly cacheKey: string;

  constructor(
    private readonly conversationId: string,
    private readonly toNumber: string,
    private readonly debounceWindowMs: number = 10000,
  ) {
    this.cacheKey = smsDebouncerKey(conversationId);
  }

  async addMessage(message: T): Promise<{
    shouldProcess: boolean;
    messages: T[];
  }> {
    console.info("Adding SMS to debouncer", {
      messageId: (message as any).id,
      conversationId: this.conversationId,
    });

    const existingEntry = await kv.get<SmsCacheEntry<T>>(this.cacheKey);

    if (!existingEntry) {
      // First message in the window
      const newEntry: SmsCacheEntry<T> = {
        messages: [message],
        lastProcessed: new Date().toISOString(),
      };

      await kv.set(this.cacheKey, newEntry, {
        ex: this.debounceWindowMs / 1000,
      });
      return { shouldProcess: false, messages: [message] };
    }

    // Add message to existing entry
    existingEntry.messages.push(message);
    await kv.set(this.cacheKey, existingEntry, {
      ex: this.debounceWindowMs / 1000,
    });

    return {
      shouldProcess: false,
      messages: existingEntry.messages,
    };
  }

  async getMessages(): Promise<T[]> {
    const entry = await kv.get<SmsCacheEntry<T>>(this.cacheKey);
    return entry?.messages ?? [];
  }

  async clear() : Promise<void> {
    await kv.del(this.cacheKey);
  }

  async processMessages(): Promise<T[]> {
    const entry = await kv.get<SmsCacheEntry<T>>(this.cacheKey);
    if (!entry) {
      return [];
    }

    const messages = entry.messages;
    await this.clear();
    return messages;
  }
}
