import { env, SELF } from "cloudflare:test";
import {
  agents,
  conversations,
  getDb,
  messages as messagesTable,
  parts,
  users,
} from "@poppy/db";
import { formatAgentConversation } from "@poppy/lib";
import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExecutionAgent,
  findExecutionAgentByPurpose,
  getOrCreateInteractionAgent,
  updateAgentStatus,
} from "../../services/agents";

// Only mock the Loop Message client (we don't want to send real SMS)
vi.mock("../../clients/loop-message", () => ({
  loopClient: {
    sendMessage: vi.fn().mockResolvedValue({
      success: true,
      message_id: "mock-message-id",
    }),
  },
}));

describe("Agent System E2E Tests", () => {
  let db: ReturnType<typeof getDb>;
  let conversationId: string;
  let testUser: any;

  beforeEach(async () => {
    db = getDb(env.HYPERDRIVE.connectionString);

    // Create a test user
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: `+1${Date.now()}`,
      })
      .returning();
    testUser = user;

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
  });

  describe("Agent Manager", () => {
    it("should create a new interaction agent for a conversation", async () => {
      const agent = await getOrCreateInteractionAgent(db, conversationId);

      expect(agent).toBeDefined();
      expect(agent.agentType).toBe("interaction");
      expect(agent.conversationId).toBe(conversationId);
      expect(agent.purpose).toBe("conversation_handler");
      expect(agent.status).toBe("active");
    });

    it("should return existing interaction agent instead of creating new one", async () => {
      const agent1 = await getOrCreateInteractionAgent(db, conversationId);
      const agent2 = await getOrCreateInteractionAgent(db, conversationId);

      expect(agent1.id).toBe(agent2.id);
    });

    it("should create an execution agent", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      const executionAgent = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "test_task_executor",
      });

      expect(executionAgent).toBeDefined();
      expect(executionAgent.agentType).toBe("execution");
      expect(executionAgent.parentInteractionAgentId).toBe(interactionAgent.id);
      expect(executionAgent.conversationId).toBe(conversationId);
      expect(executionAgent.purpose).toBe("test_task_executor");
      expect(executionAgent.status).toBe("active");
    });

    it("should find execution agent by purpose keyword", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      const executionAgent = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "weather_forecaster",
      });

      const foundAgent = await findExecutionAgentByPurpose(
        db,
        interactionAgent.id,
        "weather",
      );

      expect(foundAgent).toBeDefined();
      expect(foundAgent?.id).toBe(executionAgent.id);
    });

    it("should return undefined when no matching execution agent found", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      const foundAgent = await findExecutionAgentByPurpose(
        db,
        interactionAgent.id,
        "nonexistent",
      );

      expect(foundAgent).toBeUndefined();
    });

    it("should update agent status", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      const executionAgent = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "test_task",
      });

      const updatedAgent = await updateAgentStatus(
        db,
        executionAgent.id,
        "completed",
        {
          result: { success: true },
        },
      );

      expect(updatedAgent.status).toBe("completed");
      expect(updatedAgent.result).toEqual({ success: true });
      expect(updatedAgent.completedAt).toBeDefined();
    });
  });

  describe("Conversation Formatting", () => {
    it("should format conversation history with user messages", async () => {
      // Create a message
      const [message] = await db
        .insert(messagesTable)
        .values({
          conversationId,
          userId: testUser.id,
          isOutbound: false,
          rawPayload: {},
        })
        .returning();

      await db.insert(parts).values({
        messageId: message.id,
        type: "text",
        content: {
          type: "text",
          text: "Hello, how are you?",
        },
        order: 0,
      });

      // Fetch conversation history
      const conversationHistory = await db.query.messages.findMany({
        where: eq(messagesTable.conversationId, conversationId),
        with: {
          parts: {
            orderBy: (parts, { asc }) => [asc(parts.order)],
          },
          user: true,
        },
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      });

      const formatted = formatAgentConversation({
        conversationHistory: conversationHistory.map((msg: any) => ({
          message: msg,
          parts: msg.parts,
          user: msg.user,
        })),
        agentMessages: [],
        currentMessage: {
          message,
          parts: [
            {
              id: "test",
              messageId: message.id,
              type: "text" as const,
              content: {
                type: "text" as const,
                text: "Hello, how are you?",
              },
              createdAt: new Date(),
              order: 0,
            },
          ],
        },
        isGroup: false,
      });

      expect(formatted).toContain("<new_user_message>");
      expect(formatted).toContain("Hello, how are you?");
      expect(formatted).toContain("</new_user_message>");
    });

    it("should format conversation with agent messages", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      const executionAgent = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "task_executor",
      });

      // Create an agent message
      const [agentMessage] = await db
        .insert(messagesTable)
        .values({
          conversationId,
          fromAgentId: executionAgent.id,
          toAgentId: interactionAgent.id,
          agentMessageType: "result",
          isOutbound: false,
          rawPayload: {},
        })
        .returning();

      await db.insert(parts).values({
        messageId: agentMessage.id,
        type: "text",
        content: {
          type: "text",
          text: "Task completed successfully",
        },
        order: 0,
      });

      const agentMessages = await db.query.messages.findMany({
        where: and(
          eq(messagesTable.conversationId, conversationId),
          eq(messagesTable.toAgentId, interactionAgent.id),
        ),
        with: {
          parts: {
            orderBy: (parts, { asc }) => [asc(parts.order)],
          },
          fromAgent: true,
        },
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      });

      const formatted = formatAgentConversation({
        conversationHistory: [],
        agentMessages: agentMessages.map((msg: any) => ({
          fromAgent: msg.fromAgent,
          toAgent: interactionAgent,
          message: msg,
          parts: msg.parts,
        })),
        isGroup: false,
      });

      expect(formatted).toContain("<conversation_history>");
      expect(formatted).toContain("<agent_message");
      expect(formatted).toContain("task_executor:");
      expect(formatted).toContain("Task completed successfully");
      expect(formatted).toContain("</agent_message>");
      expect(formatted).toContain("</conversation_history>");
    });
  });

  describe("Tool Execution", () => {
    it("should record send_message_to_agent in database", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      const executionAgent = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "test_executor",
      });

      // Record a task assignment message
      await db.insert(messagesTable).values({
        conversationId,
        fromAgentId: interactionAgent.id,
        toAgentId: executionAgent.id,
        agentMessageType: "task_assignment",
        isOutbound: false,
        rawPayload: {
          role: "user",
          agentMessage: true,
        },
      });

      // Verify the message was recorded
      const agentMessages = await db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, conversationId),
            eq(messagesTable.fromAgentId, interactionAgent.id),
            eq(messagesTable.toAgentId, executionAgent.id),
          ),
        );

      expect(agentMessages.length).toBeGreaterThan(0);
      expect(agentMessages[0].agentMessageType).toBe("task_assignment");
      expect(agentMessages[0].fromAgentId).toBe(interactionAgent.id);
      expect(agentMessages[0].toAgentId).toBe(executionAgent.id);
    });

    it("should track multiple execution agents for different tasks", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      const _agent1 = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "weather_checker",
      });

      const _agent2 = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "calendar_manager",
      });

      // Verify both agents were created
      const executionAgents = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.parentInteractionAgentId, interactionAgent.id),
            eq(agents.agentType, "execution"),
          ),
        );

      expect(executionAgents.length).toBe(2);
      expect(executionAgents.map((a) => a.purpose)).toContain(
        "weather_checker",
      );
      expect(executionAgents.map((a) => a.purpose)).toContain(
        "calendar_manager",
      );
    });
  });

  describe("Agent Lifecycle", () => {
    it("should track agent from creation to completion", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      // Create execution agent
      const executionAgent = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "lifecycle_test",
      });

      expect(executionAgent.status).toBe("active");
      expect(executionAgent.createdAt).toBeDefined();
      expect(executionAgent.completedAt).toBeNull();

      // Mark as completed
      const completedAgent = await updateAgentStatus(
        db,
        executionAgent.id,
        "completed",
        {
          result: { data: "test result" },
        },
      );

      expect(completedAgent.status).toBe("completed");
      expect(completedAgent.completedAt).toBeDefined();
      expect(completedAgent.result).toEqual({ data: "test result" });
    });

    it("should handle agent failure state", async () => {
      const interactionAgent = await getOrCreateInteractionAgent(
        db,
        conversationId,
      );

      const executionAgent = await createExecutionAgent(db, {
        parentInteractionAgentId: interactionAgent.id,
        conversationId,
        purpose: "failure_test",
      });

      // Mark as failed with error message
      const failedAgent = await updateAgentStatus(
        db,
        executionAgent.id,
        "failed",
        {
          errorMessage: "Task execution failed: timeout",
        },
      );

      expect(failedAgent.status).toBe("failed");
      expect(failedAgent.completedAt).toBeDefined();
      expect(failedAgent.errorMessage).toBe("Task execution failed: timeout");
    });
  });

  describe("End-to-End Message Processing", () => {
    it("should process incoming message through full agent system with real AI", async () => {
      const testPhoneNumber = `+1${Date.now()}`;
      const validPayload = {
        alert_type: "message_inbound",
        message_id: `test-msg-${Date.now()}`,
        webhook_id: "test-webhook-id",
        recipient: testPhoneNumber,
        text: "What is 2+2?",
        sender_name: "+15555551234",
        thread_id: "test-thread-e2e",
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

      // Wait for debounce + AI processing
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Verify interaction agent was created
      const allConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.sender, validPayload.sender_name))
        .orderBy(desc(conversations.createdAt));

      expect(allConversations.length).toBeGreaterThan(0);
      const conversation = allConversations[0];

      const interactionAgents = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.conversationId, conversation.id),
            eq(agents.agentType, "interaction"),
          ),
        );

      expect(interactionAgents.length).toBeGreaterThan(0);
      const interactionAgent = interactionAgents[0];
      expect(interactionAgent.status).toBe("active");
      expect(interactionAgent.purpose).toBe("conversation_handler");

      // Verify messages were stored
      const allMessages = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversation.id))
        .orderBy(desc(messagesTable.createdAt));

      expect(allMessages.length).toBeGreaterThanOrEqual(1);

      // There should be at least the inbound message
      const inboundMessage = allMessages.find((m) => m.isOutbound === false);
      expect(inboundMessage).toBeDefined();

      // Check if AI responded (there should be an outbound message)
      const outboundMessages = allMessages.filter((m) => m.isOutbound);
      if (outboundMessages.length > 0) {
        // Verify the outbound message has parts
        const outboundParts = await db
          .select()
          .from(parts)
          .where(eq(parts.messageId, outboundMessages[0].id));

        expect(outboundParts.length).toBeGreaterThan(0);
        expect(outboundParts[0].type).toBe("text");
        // The AI should have responded with something about 2+2=4
        const responseText = (outboundParts[0].content as any).text;
        expect(responseText).toBeDefined();
        expect(responseText.length).toBeGreaterThan(0);
      }
    }, 15000);

    it("should handle conversation history correctly", async () => {
      const testPhoneNumber = `+1${Date.now()}`;

      // Send first message
      const firstPayload = {
        alert_type: "message_inbound",
        message_id: `test-msg-1-${Date.now()}`,
        webhook_id: "test-webhook-id-1",
        recipient: testPhoneNumber,
        text: "My name is Alice",
        sender_name: "+15555551234",
        thread_id: `test-thread-history-${Date.now()}`,
        delivery_type: "imessage" as const,
      };

      await SELF.fetch("https://example.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(firstPayload),
      });

      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Send second message asking to recall the name
      const secondPayload = {
        ...firstPayload,
        message_id: `test-msg-2-${Date.now()}`,
        webhook_id: "test-webhook-id-2",
        text: "What is my name?",
      };

      await SELF.fetch("https://example.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(secondPayload),
      });

      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Verify conversation was maintained
      const allConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.sender, firstPayload.sender_name))
        .orderBy(desc(conversations.createdAt));

      const conversation = allConversations[0];

      const allMessages = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversation.id))
        .orderBy(messagesTable.createdAt);

      // Should have at least 2 inbound messages
      const inboundMessages = allMessages.filter((m) => !m.isOutbound);
      expect(inboundMessages.length).toBeGreaterThanOrEqual(2);

      // The same interaction agent should have been reused
      const interactionAgents = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.conversationId, conversation.id),
            eq(agents.agentType, "interaction"),
          ),
        );

      expect(interactionAgents.length).toBe(1); // Only one interaction agent per conversation
    }, 20000);
  });
});
