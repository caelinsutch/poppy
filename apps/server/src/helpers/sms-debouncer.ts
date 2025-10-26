import type Redis from "ioredis";

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
    private readonly redis: Redis,
    private readonly conversationId: string,
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

    const existingData = await this.redis.get(this.cacheKey);
    const existingEntry = existingData
      ? (JSON.parse(existingData) as SmsCacheEntry<T>)
      : null;

    if (!existingEntry) {
      // First message in the window
      const newEntry: SmsCacheEntry<T> = {
        messages: [message],
        lastProcessed: new Date().toISOString(),
      };

      await this.redis.set(
        this.cacheKey,
        JSON.stringify(newEntry),
        "PX",
        this.debounceWindowMs,
      );
      return { shouldProcess: false, messages: [message] };
    }

    // Add message to existing entry
    existingEntry.messages.push(message);
    await this.redis.set(
      this.cacheKey,
      JSON.stringify(existingEntry),
      "PX",
      this.debounceWindowMs,
    );

    return {
      shouldProcess: false,
      messages: existingEntry.messages,
    };
  }

  async getMessages(): Promise<T[]> {
    const data = await this.redis.get(this.cacheKey);
    if (!data) {
      return [];
    }
    const entry = JSON.parse(data) as SmsCacheEntry<T>;
    return entry.messages ?? [];
  }

  async clear(): Promise<void> {
    await this.redis.del(this.cacheKey);
  }

  async processMessages(): Promise<T[]> {
    const data = await this.redis.get(this.cacheKey);
    if (!data) {
      return [];
    }

    const entry = JSON.parse(data) as SmsCacheEntry<T>;
    const messages = entry.messages;
    await this.clear();
    return messages;
  }
}
