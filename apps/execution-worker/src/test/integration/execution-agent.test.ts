import { env } from "cloudflare:test";
import { agents, conversations, getDb, users } from "@poppy/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { ExecutionAgent } from "../../durable-objects/execution-agent";
import type { TaskInput } from "../../types";

describe("ExecutionAgent - Integration Tests", () => {
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

    // Create a test execution agent in database
    const [agent] = await db
      .insert(agents)
      .values({
        conversationId,
        agentType: "execution",
        purpose: "test_execution_agent",
        status: "active",
      })
      .returning();

    testAgentId = agent.id;
  });

  describe("executeTask - Simple Tasks", () => {
    it("should execute a simple math task with real AI", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const taskInput: TaskInput = {
        agentId: testAgentId,
        conversationId,
        taskDescription: "Calculate 157 * 23 and explain your reasoning",
      };

      const result = await agent.executeTask(taskInput);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const output = (result.result as any).output;
      expect(output).toBeDefined();
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);

      // Verify agent status was updated in database
      const updatedAgent = await db.query.agents.findFirst({
        where: eq(agents.id, testAgentId),
      });

      expect(updatedAgent?.status).toBe("completed");
      expect(updatedAgent?.result).toBeDefined();
    }, 30000);

    it("should handle reasoning tasks without tools", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const taskInput: TaskInput = {
        agentId: testAgentId,
        conversationId,
        taskDescription:
          "Explain the concept of recursion in programming in 2-3 sentences",
      };

      const result = await agent.executeTask(taskInput);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const output = (result.result as any).output;
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(50);
    }, 30000);
  });

  describe("executeTask - With Research Tool", () => {
    it("should use research tool to find information with real Exa API", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const taskInput: TaskInput = {
        agentId: testAgentId,
        conversationId,
        taskDescription:
          "Search for the latest news about artificial intelligence and summarize the top 3 findings",
      };

      const result = await agent.executeTask(taskInput);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const output = (result.result as any).output;
      const steps = (result.result as any).steps;

      expect(output).toBeDefined();
      expect(steps).toBeGreaterThan(0);
      expect(output.length).toBeGreaterThan(100);
    }, 60000);

    it("should handle research tasks about specific topics", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const taskInput: TaskInput = {
        agentId: testAgentId,
        conversationId,
        taskDescription:
          "Research the current weather forecast for San Francisco and provide a brief summary",
      };

      const result = await agent.executeTask(taskInput);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const output = (result.result as any).output;
      expect(output).toBeDefined();
      // Should mention weather or San Francisco
      expect(output.toLowerCase()).toMatch(/weather|temperature|san francisco/);
    }, 60000);
  });

  describe("executeTask - With Wait Tool", () => {
    it("should use wait tool to pause execution", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const startTime = Date.now();

      const taskInput: TaskInput = {
        agentId: testAgentId,
        conversationId,
        taskDescription:
          "Wait for 2 seconds, then respond with a confirmation message",
      };

      const result = await agent.executeTask(taskInput);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      // Execution should take at least 2 seconds
      expect(executionTime).toBeGreaterThanOrEqual(1800);

      const output = (result.result as any).output;
      expect(output).toBeDefined();
    }, 30000);
  });

  describe("executeTask - Multi-Tool Usage", () => {
    it("should use multiple tools in sequence", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const taskInput: TaskInput = {
        agentId: testAgentId,
        conversationId,
        taskDescription:
          "First, wait for 1 second. Then search for information about TypeScript programming language. Finally, provide a brief summary.",
      };

      const result = await agent.executeTask(taskInput);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const steps = (result.result as any).steps;
      expect(steps).toBeGreaterThan(1); // Should have multiple steps

      const output = (result.result as any).output;
      expect(output).toBeDefined();
      expect(output.toLowerCase()).toMatch(/typescript/);
    }, 60000);
  });

  describe("executeTask - Error Handling", () => {
    it("should handle invalid agent ID gracefully", async () => {
      const id = env.EXECUTION_AGENT.idFromName("non-existent-agent");
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const taskInput: TaskInput = {
        agentId: "non-existent-agent",
        conversationId,
        taskDescription: "Test task",
      };

      const result = await agent.executeTask(taskInput);

      // Should still attempt to execute, might succeed or fail depending on DB state
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    }, 30000);

    it("should update agent status to failed on error", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      // Initialize agent state
      await agent.setState({
        agentId: testAgentId,
        taskDescription: "",
        status: "pending",
        result: null,
        triggers: [],
      });

      // Pass invalid input to trigger error (empty agentId will cause DB lookup to fail)
      const taskInput: TaskInput = {
        agentId: "", // Empty agentId will cause error
        conversationId,
        taskDescription: "Test task",
      };

      const _result = await agent.executeTask(taskInput);

      const status = await agent.getStatus();
      expect(status.status).toBe("failed");
    }, 30000);
  });

  describe("executeTask - State Management", () => {
    it("should update agent state during execution", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const taskInput: TaskInput = {
        agentId: testAgentId,
        conversationId,
        taskDescription: "Simple test task: What is 2 + 2?",
      };

      await agent.executeTask(taskInput);

      const status = await agent.getStatus();

      expect(status.agentId).toBe(testAgentId);
      expect(status.taskDescription).toBe(taskInput.taskDescription);
      expect(status.status).toBe("completed");
      expect(status.result).toBeDefined();
    }, 30000);

    it("should maintain state across multiple calls", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      // First task
      await agent.executeTask({
        agentId: testAgentId,
        conversationId,
        taskDescription: "Task 1",
      });

      // Add a trigger
      await agent.createTrigger({
        payload: "Scheduled task",
        startTime: new Date(Date.now() + 3600000).toISOString(),
      });

      // Second task
      await agent.executeTask({
        agentId: testAgentId,
        conversationId,
        taskDescription: "Task 2",
      });

      const status = await agent.getStatus();

      // Should still have the trigger from earlier
      expect(status.triggers).toHaveLength(1);
      // Task description should be from the latest task
      expect(status.taskDescription).toBe("Task 2");
    }, 60000);
  });

  describe("executeTrigger", () => {
    it("should execute a scheduled trigger", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      // Initialize agent state
      await agent.setState({
        agentId: testAgentId,
        taskDescription: "",
        status: "pending",
        result: null,
        triggers: [],
      });

      // Create a trigger
      const createResult = await agent.createTrigger({
        payload: "Calculate 10 + 15",
        startTime: new Date().toISOString(),
      });

      const triggerId = createResult.trigger?.id;

      // Execute the trigger
      const result = await agent.executeTrigger(triggerId);

      expect(result.success).toBe(true);

      const status = await agent.getStatus();
      expect(status.status).toBe("completed");
    }, 30000);

    it("should not execute paused trigger", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      // Initialize agent state
      await agent.setState({
        agentId: testAgentId,
        taskDescription: "",
        status: "pending",
        result: null,
        triggers: [],
      });

      // Create and pause a trigger
      const createResult = await agent.createTrigger({
        payload: "Paused task",
        startTime: new Date().toISOString(),
      });

      const triggerId = createResult.trigger?.id;

      await agent.updateTrigger(triggerId, { status: "paused" });

      // Try to execute the paused trigger
      const result = await agent.executeTrigger(triggerId);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Trigger is not active");
    });

    it("should return error for non-existent trigger", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      // Initialize agent state
      await agent.setState({
        agentId: testAgentId,
        taskDescription: "",
        status: "pending",
        result: null,
        triggers: [],
      });

      const result = await agent.executeTrigger("non-existent-trigger-id");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Trigger not found");
    });
  });

  describe("Database Integration", () => {
    it("should update agent status in database on completion", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      const taskInput: TaskInput = {
        agentId: testAgentId,
        conversationId,
        taskDescription: "Simple task",
      };

      await agent.executeTask(taskInput);

      // Verify database was updated
      const updatedAgent = await db.query.agents.findFirst({
        where: eq(agents.id, testAgentId),
      });

      expect(updatedAgent?.status).toBe("completed");
      expect(updatedAgent?.result).toBeDefined();
      expect(updatedAgent?.completedAt).toBeDefined();
    }, 30000);

    it("should track agent lifecycle in database", async () => {
      const id = env.EXECUTION_AGENT.idFromName(testAgentId);
      const stub = env.EXECUTION_AGENT.get(id);
      const agent = stub as unknown as ExecutionAgent;

      // Check initial status
      const initialAgent = await db.query.agents.findFirst({
        where: eq(agents.id, testAgentId),
      });
      expect(initialAgent?.status).toBe("active");

      // Execute task
      await agent.executeTask({
        agentId: testAgentId,
        conversationId,
        taskDescription: "Test task",
      });

      // Check final status
      const completedAgent = await db.query.agents.findFirst({
        where: eq(agents.id, testAgentId),
      });
      expect(completedAgent?.status).toBe("completed");
      expect(completedAgent?.completedAt).toBeDefined();
    }, 30000);
  });
});
