import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Health check endpoints", () => {
  it("GET /health should return ok status with database connection", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);

    const data = await response.json<{
      status: string;
      timestamp: string;
      database: string;
    }>();
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe("string");
    expect(data.database).toBe("connected");
  });
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
});
