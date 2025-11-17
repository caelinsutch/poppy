import { env } from "cloudflare:test";
import { agents, conversations, getDb, users } from "@poppy/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { WorkerEnv } from "../../context";
import { updateAgentStatus } from "../../services/agent-manager";

// Extend ProvidedEnv to include our bindings
declare module "cloudflare:test" {
  interface ProvidedEnv extends WorkerEnv {}
}

describe("Agent Manager Service", () => {
  let db: ReturnType<typeof getDb>;
  let conversationId: string;
  let testAgentId: string;

  beforeEach(async () => {
    db = getDb(env.HYPERDRIVE.connectionString);

    // Create a test user
    const [_user] = await db
      .insert(users)
      .values({
        phoneNumber: `+1${Date.now()}`,
      })
      .returning();

    // Create a test conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        sender: "+15555551234",
        isGroup: false,
        channelType: "loop",
      })
      .returning();

    conversationId = conversation.id;

    // Create a test execution agent
    const [agent] = await db
      .insert(agents)
      .values({
        conversationId,
        agentType: "execution",
        purpose: "test_agent",
        status: "active",
      })
      .returning();

    testAgentId = agent.id;
  });

  describe("updateAgentStatus", () => {
    it("should update agent status to completed", async () => {
      const updatedAgent = await updateAgentStatus(
        db,
        testAgentId,
        "completed",
      );

      expect(updatedAgent.status).toBe("completed");
      expect(updatedAgent.completedAt).toBeDefined();
    });

    it("should update agent status to failed", async () => {
      const updatedAgent = await updateAgentStatus(db, testAgentId, "failed");

      expect(updatedAgent.status).toBe("failed");
      expect(updatedAgent.completedAt).toBeDefined();
    });

    it("should update agent status to active without setting completedAt", async () => {
      // First complete the agent
      await updateAgentStatus(db, testAgentId, "completed");

      // Then reactivate it (edge case)
      const updatedAgent = await updateAgentStatus(db, testAgentId, "active");

      expect(updatedAgent.status).toBe("active");
      // completedAt should still be set from before (not cleared)
      expect(updatedAgent.completedAt).toBeDefined();
    });

    it("should store result data when provided", async () => {
      const result = {
        output: "Task completed successfully",
        data: [1, 2, 3],
      };

      const updatedAgent = await updateAgentStatus(
        db,
        testAgentId,
        "completed",
        { result },
      );

      expect(updatedAgent.status).toBe("completed");
      expect(updatedAgent.result).toEqual(result);
    });

    it("should store error message when provided", async () => {
      const errorMessage = "Task failed: API timeout";

      const updatedAgent = await updateAgentStatus(db, testAgentId, "failed", {
        errorMessage,
      });

      expect(updatedAgent.status).toBe("failed");
      expect(updatedAgent.errorMessage).toBe(errorMessage);
    });

    it("should store both result and error message", async () => {
      const result = { partialData: "some output" };
      const errorMessage = "Task partially failed";

      const updatedAgent = await updateAgentStatus(db, testAgentId, "failed", {
        result,
        errorMessage,
      });

      expect(updatedAgent.status).toBe("failed");
      expect(updatedAgent.result).toEqual(result);
      expect(updatedAgent.errorMessage).toBe(errorMessage);
    });

    it("should persist updates to database", async () => {
      const result = { data: "test" };

      await updateAgentStatus(db, testAgentId, "completed", { result });

      // Fetch from database to verify persistence
      const fetchedAgent = await db.query.agents.findFirst({
        where: eq(agents.id, testAgentId),
      });

      expect(fetchedAgent?.status).toBe("completed");
      expect(fetchedAgent?.result).toEqual(result);
      expect(fetchedAgent?.completedAt).toBeDefined();
    });

    it("should handle complex result objects", async () => {
      const complexResult = {
        output: "Task completed",
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        steps: 5,
        metadata: {
          model: "gemini-2.5-flash",
          timestamp: new Date().toISOString(),
        },
      };

      const updatedAgent = await updateAgentStatus(
        db,
        testAgentId,
        "completed",
        { result: complexResult },
      );

      expect(updatedAgent.result).toEqual(complexResult);
    });

    it("should handle consecutive status updates", async () => {
      // Update to active
      await updateAgentStatus(db, testAgentId, "active");

      // Update to completed
      const completedAgent = await updateAgentStatus(
        db,
        testAgentId,
        "completed",
        {
          result: { data: "final result" },
        },
      );

      expect(completedAgent.status).toBe("completed");
      expect(completedAgent.result).toEqual({ data: "final result" });
    });

    it("should overwrite previous result on update", async () => {
      // First update with initial result
      await updateAgentStatus(db, testAgentId, "active", {
        result: { data: "initial" },
      });

      // Second update with new result
      const updatedAgent = await updateAgentStatus(
        db,
        testAgentId,
        "completed",
        {
          result: { data: "final" },
        },
      );

      expect(updatedAgent.result).toEqual({ data: "final" });
    });

    it("should handle empty result object", async () => {
      const updatedAgent = await updateAgentStatus(
        db,
        testAgentId,
        "completed",
        {
          result: {},
        },
      );

      expect(updatedAgent.result).toEqual({});
    });

    it("should handle null result explicitly", async () => {
      const updatedAgent = await updateAgentStatus(
        db,
        testAgentId,
        "completed",
        {
          result: null,
        },
      );

      expect(updatedAgent.result).toBeNull();
    });
  });
});
