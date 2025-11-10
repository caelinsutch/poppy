interface KVCacheEntry<T> {
  messages: T[];
  lastProcessed: string;
}

// Message-related keys
const kvDebouncerKey = (conversationId: string) =>
  `sms-debouncer:${conversationId}`;

export class KVDebouncer<T> {
  private readonly cacheKey: string;

  constructor(
    private readonly kv: KVNamespace,
    private readonly conversationId: string,
    private readonly debounceWindowMs: number = 10000,
  ) {
    this.cacheKey = kvDebouncerKey(conversationId);
  }

  async addMessage(message: T): Promise<{
    shouldProcess: boolean;
    messages: T[];
  }> {
    console.info("Adding SMS to KV debouncer", {
      messageId: (message as any).id,
      conversationId: this.conversationId,
    });

    const existingData = await this.kv.get(this.cacheKey, "text");
    const existingEntry = existingData
      ? (JSON.parse(existingData) as KVCacheEntry<T>)
      : null;

    if (!existingEntry) {
      // First message in the window
      const newEntry: KVCacheEntry<T> = {
        messages: [message],
        lastProcessed: new Date().toISOString(),
      };

      // Set with expiration time in seconds
      const expirationTtl = Math.ceil(this.debounceWindowMs / 1000);
      await this.kv.put(this.cacheKey, JSON.stringify(newEntry), {
        expirationTtl,
      });
      return { shouldProcess: false, messages: [message] };
    }

    // Add message to existing entry
    existingEntry.messages.push(message);
    const expirationTtl = Math.ceil(this.debounceWindowMs / 1000);
    await this.kv.put(this.cacheKey, JSON.stringify(existingEntry), {
      expirationTtl,
    });

    return {
      shouldProcess: false,
      messages: existingEntry.messages,
    };
  }

  async getMessages(): Promise<T[]> {
    const data = await this.kv.get(this.cacheKey, "text");
    if (!data) {
      return [];
    }
    const entry = JSON.parse(data) as KVCacheEntry<T>;
    return entry.messages ?? [];
  }

  async clear(): Promise<void> {
    await this.kv.delete(this.cacheKey);
  }

  async processMessages(): Promise<T[]> {
    const data = await this.kv.get(this.cacheKey, "text");
    if (!data) {
      return [];
    }

    const entry = JSON.parse(data) as KVCacheEntry<T>;
    const messages = entry.messages;
    await this.clear();
    return messages;
  }
}
