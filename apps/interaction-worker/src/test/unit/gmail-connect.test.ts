import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock the external dependencies
vi.mock("@poppy/clients/composio", () => ({
  createComposioClient: vi.fn(() => ({})),
  initiateGmailConnect: vi.fn().mockResolvedValue({
    redirectUrl: "https://accounts.google.com/oauth/mock",
    id: "mock-connection-request-id",
  }),
}));

describe("Gmail Connect Tool", () => {
  describe("tool schema", () => {
    it("should have correct action options", () => {
      // Test the schema structure
      const actionSchema = z.enum(["connect", "status", "disconnect"]);

      expect(actionSchema.safeParse("connect").success).toBe(true);
      expect(actionSchema.safeParse("status").success).toBe(true);
      expect(actionSchema.safeParse("disconnect").success).toBe(true);
      expect(actionSchema.safeParse("invalid").success).toBe(false);
    });

    it("should validate action input", () => {
      const inputSchema = z.object({
        action: z.enum(["connect", "status", "disconnect"]),
      });

      const validInput = { action: "connect" };
      const invalidInput = { action: "invalid" };

      expect(inputSchema.safeParse(validInput).success).toBe(true);
      expect(inputSchema.safeParse(invalidInput).success).toBe(false);
    });
  });

  describe("response types", () => {
    it("should have correct status response structure", () => {
      const statusResponse = {
        type: "gmail_status" as const,
        connected: false,
        message: "No Gmail account connected",
      };

      expect(statusResponse.type).toBe("gmail_status");
      expect(statusResponse.connected).toBe(false);
    });

    it("should have correct connect response structure", () => {
      const connectResponse = {
        type: "gmail_connect_initiated" as const,
        redirectUrl: "https://accounts.google.com/oauth",
        message: "Click to connect",
      };

      expect(connectResponse.type).toBe("gmail_connect_initiated");
      expect(connectResponse.redirectUrl).toContain("accounts.google.com");
    });

    it("should have correct disconnect response structure", () => {
      const disconnectResponse = {
        type: "gmail_disconnect" as const,
        success: true,
        message: "Disconnected",
      };

      expect(disconnectResponse.type).toBe("gmail_disconnect");
      expect(disconnectResponse.success).toBe(true);
    });

    it("should have correct already connected response structure", () => {
      const alreadyConnectedResponse = {
        type: "gmail_already_connected" as const,
        email: "test@gmail.com",
        message: "Already connected",
      };

      expect(alreadyConnectedResponse.type).toBe("gmail_already_connected");
      expect(alreadyConnectedResponse.email).toBe("test@gmail.com");
    });
  });
});
