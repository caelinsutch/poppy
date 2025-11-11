import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { DODebouncer } from "../../helpers/do-debouncer";
import type { LoopMessageInboundPayload } from "@poppy/schemas";
import type { WorkerEnv } from "../../context";

// Extend ProvidedEnv to include our bindings
declare module "cloudflare:test" {
  interface ProvidedEnv extends WorkerEnv {}
}

// Mock message factory
const createMockMessage = (
  messageId: string,
  text: string,
): LoopMessageInboundPayload => ({
  alert_type: "message_inbound",
  message_id: messageId,
  webhook_id: "test-webhook-id",
  text,
  recipient: "+1234567890",
  sender_name: "Test User",
});

describe("DODebouncer", () => {
  let debouncer: DODebouncer;
  const conversationId = "test-conversation-123";

  beforeEach(() => {
    // Create a new debouncer instance for each test
    debouncer = new DODebouncer(env.MESSAGE_DEBOUNCER, conversationId);
  });

  describe("addMessage", () => {
    it("should add a message and return shouldProcess: false", async () => {
      const message = createMockMessage("msg-1", "Hello world");

      const result = await debouncer.addMessage(message, 1000);

      expect(result.shouldProcess).toBe(false);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual(message);
    });

    it("should accumulate multiple messages", async () => {
      const message1 = createMockMessage("msg-1", "Hello");
      const message2 = createMockMessage("msg-2", "World");
      const message3 = createMockMessage("msg-3", "!");

      await debouncer.addMessage(message1, 1000);
      await debouncer.addMessage(message2, 1000);
      const result = await debouncer.addMessage(message3, 1000);

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].text).toBe("Hello");
      expect(result.messages[1].text).toBe("World");
      expect(result.messages[2].text).toBe("!");
    });

    it("should maintain message order", async () => {
      const messages = [
        createMockMessage("msg-1", "First"),
        createMockMessage("msg-2", "Second"),
        createMockMessage("msg-3", "Third"),
        createMockMessage("msg-4", "Fourth"),
      ];

      for (const msg of messages) {
        await debouncer.addMessage(msg, 1000);
      }

      const result = await debouncer.getMessages();

      expect(result).toHaveLength(4);
      expect(result.map((m) => m.text)).toEqual([
        "First",
        "Second",
        "Third",
        "Fourth",
      ]);
    });

    it("should reset timeout when new message arrives", async () => {
      const message1 = createMockMessage("msg-1", "Hello");
      const message2 = createMockMessage("msg-2", "World");

      // Add first message
      await debouncer.addMessage(message1, 100);

      // Wait a bit, but not long enough for timeout
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Add second message (should reset the timeout)
      await debouncer.addMessage(message2, 100);

      // Wait another 50ms (still within new timeout window)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Messages should still be there
      const messages = await debouncer.getMessages();
      expect(messages).toHaveLength(2);
    });
  });

  describe("getMessages", () => {
    it("should return empty array when no messages", async () => {
      const messages = await debouncer.getMessages();
      expect(messages).toEqual([]);
    });

    it("should return all accumulated messages", async () => {
      const message1 = createMockMessage("msg-1", "Hello");
      const message2 = createMockMessage("msg-2", "World");

      await debouncer.addMessage(message1, 1000);
      await debouncer.addMessage(message2, 1000);

      const messages = await debouncer.getMessages();

      expect(messages).toHaveLength(2);
      expect(messages[0].message_id).toBe("msg-1");
      expect(messages[1].message_id).toBe("msg-2");
    });

    it("should return a copy of messages array", async () => {
      const message = createMockMessage("msg-1", "Hello");
      await debouncer.addMessage(message, 1000);

      const messages1 = await debouncer.getMessages();
      const messages2 = await debouncer.getMessages();

      // Should be different array instances
      expect(messages1).not.toBe(messages2);
      // But with same content
      expect(messages1).toEqual(messages2);
    });
  });

  describe("clear", () => {
    it("should clear all messages", async () => {
      const message1 = createMockMessage("msg-1", "Hello");
      const message2 = createMockMessage("msg-2", "World");

      await debouncer.addMessage(message1, 1000);
      await debouncer.addMessage(message2, 1000);

      await debouncer.clear();

      const messages = await debouncer.getMessages();
      expect(messages).toEqual([]);
    });

    it("should cancel pending timeout", async () => {
      const message = createMockMessage("msg-1", "Hello");

      await debouncer.addMessage(message, 100);
      await debouncer.clear();

      // Wait for what would have been the timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have no messages since we cleared
      const messages = await debouncer.getMessages();
      expect(messages).toEqual([]);
    });

    it("should allow new messages after clearing", async () => {
      const message1 = createMockMessage("msg-1", "Hello");
      const message2 = createMockMessage("msg-2", "World");

      await debouncer.addMessage(message1, 1000);
      await debouncer.clear();
      await debouncer.addMessage(message2, 1000);

      const messages = await debouncer.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].message_id).toBe("msg-2");
    });
  });

  describe("multiple conversation isolation", () => {
    it("should isolate messages between different conversations", async () => {
      const debouncer1 = new DODebouncer(
        env.MESSAGE_DEBOUNCER,
        "conversation-1",
      );
      const debouncer2 = new DODebouncer(
        env.MESSAGE_DEBOUNCER,
        "conversation-2",
      );

      const message1 = createMockMessage("msg-1", "Hello from conv1");
      const message2 = createMockMessage("msg-2", "Hello from conv2");

      await debouncer1.addMessage(message1, 1000);
      await debouncer2.addMessage(message2, 1000);

      const messages1 = await debouncer1.getMessages();
      const messages2 = await debouncer2.getMessages();

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
      expect(messages1[0].text).toBe("Hello from conv1");
      expect(messages2[0].text).toBe("Hello from conv2");
    });

    it("should use same DO instance for same conversation ID", async () => {
      const debouncer1 = new DODebouncer(
        env.MESSAGE_DEBOUNCER,
        "same-conversation",
      );
      const debouncer2 = new DODebouncer(
        env.MESSAGE_DEBOUNCER,
        "same-conversation",
      );

      const message1 = createMockMessage("msg-1", "First message");
      const message2 = createMockMessage("msg-2", "Second message");

      await debouncer1.addMessage(message1, 1000);
      await debouncer2.addMessage(message2, 1000);

      // Both should see all messages since they share the same DO
      const messages1 = await debouncer1.getMessages();
      const messages2 = await debouncer2.getMessages();

      expect(messages1).toHaveLength(2);
      expect(messages2).toHaveLength(2);
      expect(messages1).toEqual(messages2);
    });
  });

  describe("debounce timing", () => {
    it("should keep messages for the debounce duration", async () => {
      const message = createMockMessage("msg-1", "Hello");

      await debouncer.addMessage(message, 100);

      // Immediately check - should have message
      let messages = await debouncer.getMessages();
      expect(messages).toHaveLength(1);

      // Wait half the debounce time
      await new Promise((resolve) => setTimeout(resolve, 50));
      messages = await debouncer.getMessages();
      expect(messages).toHaveLength(1);

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 60));
      messages = await debouncer.getMessages();
      // Note: The timeout fires but doesn't clear messages automatically
      // in the current implementation
      expect(messages).toHaveLength(1);
    });

    it("should handle very short debounce times", async () => {
      const message = createMockMessage("msg-1", "Quick message");

      await debouncer.addMessage(message, 10);

      const messages = await debouncer.getMessages();
      expect(messages).toHaveLength(1);
    });

    it("should handle concurrent message additions", async () => {
      const messages = Array.from({ length: 5 }, (_, i) =>
        createMockMessage(`msg-${i}`, `Message ${i}`),
      );

      // Add all messages concurrently
      await Promise.all(messages.map((msg) => debouncer.addMessage(msg, 1000)));

      const result = await debouncer.getMessages();
      expect(result).toHaveLength(5);
    });
  });

  describe("edge cases", () => {
    it("should handle messages with empty text", async () => {
      const message = createMockMessage("msg-1", "");

      const result = await debouncer.addMessage(message, 1000);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe("");
    });

    it("should handle messages with very long text", async () => {
      const longText = "a".repeat(10000);
      const message = createMockMessage("msg-1", longText);

      const result = await debouncer.addMessage(message, 1000);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe(longText);
    });

    it("should handle special characters in conversation ID", async () => {
      const specialConvId = "conv-with-special-chars-!@#$%^&*()";
      const specialDebouncer = new DODebouncer(
        env.MESSAGE_DEBOUNCER,
        specialConvId,
      );

      const message = createMockMessage("msg-1", "Test message");
      const result = await specialDebouncer.addMessage(message, 1000);

      expect(result.messages).toHaveLength(1);
    });

    it("should handle zero debounce time", async () => {
      const message = createMockMessage("msg-1", "Instant message");

      const result = await debouncer.addMessage(message, 0);

      expect(result.shouldProcess).toBe(false);
      expect(result.messages).toHaveLength(1);
    });
  });
});
