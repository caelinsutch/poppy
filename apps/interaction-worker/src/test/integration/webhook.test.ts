import { env, SELF } from "cloudflare:test";
import { conversations, getDb, messages, parts, users } from "@poppy/db";
import { desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// Mock the AI client module
vi.mock("../../clients/ai/openrouter", () => ({
  createOpenRouterClient: vi.fn(() => ({
    gemini25: {},
    gpt4o: {},
  })),
}));

// Mock the Loop Message client module
vi.mock("../../clients/loop-message", () => ({
  createLoopClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue({
      success: true,
      message_id: "mock-message-id",
    }),
  })),
}));

// Mock the web search tool
vi.mock("../../tools/web-search", () => ({
  createWebSearchTool: vi.fn(() => ({
    type: "tool",
    description: "Mock web search tool",
    parameters: {},
    execute: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock the AI SDK functions
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject: vi.fn().mockResolvedValue({
      object: { shouldRespond: true },
    }),
    generateText: vi.fn().mockResolvedValue({
      text: "Mock AI response",
      usage: { promptTokens: 10, completionTokens: 10 },
    }),
  };
});

describe("Webhook endpoint", () => {
  it("POST / should reject invalid webhook payload", async () => {
    const response = await SELF.fetch("https://example.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invalid: "payload" }),
    });

    expect(response.status).toBe(400);

    const data = await response.json<{ success: boolean }>();
    expect(data.success).toBe(false);
  });

  it("POST / should accept valid message_sent webhook", async () => {
    const validPayload = {
      alert_type: "message_sent",
      recipient: "+1234567890",
      success: true,
      message_id: "test-message-id",
      webhook_id: "test-webhook-id",
      text: "Test message",
    };

    const response = await SELF.fetch("https://example.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validPayload),
    });

    expect(response.status).toBe(200);

    const data = await response.json<{ success: boolean; read: boolean }>();
    expect(data.success).toBe(true);
    expect(data.read).toBe(true);
  });

  it("POST / should accept valid message_failed webhook", async () => {
    const validPayload = {
      alert_type: "message_failed",
      recipient: "+1234567890",
      error_code: 500,
      message_id: "test-message-id",
      webhook_id: "test-webhook-id",
      text: "Test message",
    };

    const response = await SELF.fetch("https://example.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validPayload),
    });

    expect(response.status).toBe(200);

    const data = await response.json<{ success: boolean; read: boolean }>();
    expect(data.success).toBe(true);
    expect(data.read).toBe(true);
  });

  it("POST / should accept valid message_inbound webhook and store in database", async () => {
    const testPhoneNumber = `+1${Date.now()}`; // Unique phone number for each test run
    const validPayload = {
      alert_type: "message_inbound",
      message_id: `test-msg-${Date.now()}`,
      webhook_id: "test-webhook-id",
      recipient: testPhoneNumber,
      text: "Hello, this is a test message!",
      sender_name: "+15555551234",
      thread_id: "test-thread-123",
      delivery_type: "imessage" as const,
    };

    // Send the webhook
    const response = await SELF.fetch("https://example.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validPayload),
    });

    expect(response.status).toBe(200);

    const data = await response.json<{ success: boolean }>();
    expect(data.success).toBe(true);

    // Wait for debounce window + processing (4 seconds + buffer)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Verify data was stored in database
    const db = getDb(env.DATABASE_URL as string);

    // Check user was created
    const createdUsers = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, testPhoneNumber));
    expect(createdUsers.length).toBeGreaterThan(0);
    const user = createdUsers[0];
    expect(user.phoneNumber).toBe(testPhoneNumber);

    // Check conversation was created - get the most recent one for this sender
    const allConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.sender, validPayload.sender_name))
      .orderBy(desc(conversations.createdAt));
    expect(allConversations.length).toBeGreaterThan(0);
    const conversation = allConversations[0]; // Get most recent (first due to desc order)
    expect(conversation).toBeDefined();
    expect(conversation.isGroup).toBe(false);
    expect(conversation.channelType).toBe("loop");

    // Check message was created - get the inbound message (not the outbound AI response)
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(desc(messages.createdAt));
    expect(allMessages.length).toBeGreaterThanOrEqual(1);
    const inboundMessage = allMessages.find((m) => m.isOutbound === false);
    expect(inboundMessage).toBeDefined();
    expect(inboundMessage?.userId).toBe(user.id);

    // Check parts were created for the inbound message
    const messageParts = await db
      .select()
      .from(parts)
      .where(eq(parts.messageId, inboundMessage?.id));
    expect(messageParts.length).toBeGreaterThan(0);
    expect(messageParts[0].type).toBe("text");
    expect(messageParts[0].content).toMatchObject({
      type: "text",
      text: validPayload.text,
    });
  }, 10000); // Increase timeout to 10 seconds for this test
});
