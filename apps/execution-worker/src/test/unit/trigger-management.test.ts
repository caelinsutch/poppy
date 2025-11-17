import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { WorkerEnv } from "../../context";
import type { ExecutionAgent } from "../../durable-objects/execution-agent";

// Extend ProvidedEnv to include our bindings
declare module "cloudflare:test" {
  interface ProvidedEnv extends WorkerEnv {}
}

describe("ExecutionAgent - Trigger Management", () => {
  let agent: ExecutionAgent;
  const agentId = "test-agent-123";

  beforeEach(async () => {
    // Get a new Durable Object instance for each test
    const id = env.EXECUTION_AGENT.idFromName(agentId);
    const stub = env.EXECUTION_AGENT.get(id);
    agent = stub as unknown as ExecutionAgent;

    // Initialize agent state with agentId
    await agent.setState({
      agentId,
      taskDescription: "",
      status: "pending",
      result: null,
      triggers: [],
    });
  });

  describe("createTrigger", () => {
    it("should create a new trigger with one-time execution", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

      const result = await agent.createTrigger({
        payload: "Send reminder about meeting",
        startTime,
      });

      expect(result.success).toBe(true);
      expect(result.trigger).toBeDefined();
      expect(result.trigger?.agentId).toBe(agentId);
      expect(result.trigger?.payload).toBe("Send reminder about meeting");
      expect(result.trigger?.startTime).toBe(startTime);
      expect(result.trigger?.status).toBe("active");
      expect(result.trigger?.id).toBeDefined();
      expect(result.trigger?.createdAt).toBeDefined();
    });

    it("should create a trigger with recurrence rule", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();
      const rrule = "FREQ=DAILY;INTERVAL=1"; // Daily recurrence

      const result = await agent.createTrigger({
        payload: "Daily standup reminder",
        startTime,
        rrule,
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.rrule).toBe(rrule);
    });

    it("should generate unique IDs for multiple triggers", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();

      const result1 = await agent.createTrigger({
        payload: "Task 1",
        startTime,
      });

      const result2 = await agent.createTrigger({
        payload: "Task 2",
        startTime,
      });

      expect(result1.trigger?.id).not.toBe(result2.trigger?.id);
    });

    it("should persist trigger in agent state", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();

      await agent.createTrigger({
        payload: "Test trigger",
        startTime,
      });

      const triggers = await agent.listTriggers();
      expect(triggers).toHaveLength(1);
      expect(triggers[0].payload).toBe("Test trigger");
    });
  });

  describe("updateTrigger", () => {
    let triggerId: string;

    beforeEach(async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();
      const result = await agent.createTrigger({
        payload: "Original task",
        startTime,
      });
      triggerId = result.trigger?.id;
    });

    it("should update trigger status", async () => {
      const result = await agent.updateTrigger(triggerId, {
        status: "paused",
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.status).toBe("paused");
    });

    it("should update trigger start time", async () => {
      const newStartTime = new Date(Date.now() + 7200000).toISOString(); // 2 hours from now

      const result = await agent.updateTrigger(triggerId, {
        startTime: newStartTime,
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.startTime).toBe(newStartTime);
    });

    it("should update trigger recurrence rule", async () => {
      const rrule = "FREQ=WEEKLY;BYDAY=MO,WE,FR";

      const result = await agent.updateTrigger(triggerId, {
        rrule,
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.rrule).toBe(rrule);
    });

    it("should update multiple fields at once", async () => {
      const newStartTime = new Date(Date.now() + 7200000).toISOString();
      const rrule = "FREQ=DAILY;INTERVAL=2";

      const result = await agent.updateTrigger(triggerId, {
        status: "paused",
        startTime: newStartTime,
        rrule,
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.status).toBe("paused");
      expect(result.trigger?.startTime).toBe(newStartTime);
      expect(result.trigger?.rrule).toBe(rrule);
    });

    it("should return error for non-existent trigger", async () => {
      const result = await agent.updateTrigger("non-existent-id", {
        status: "paused",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Trigger not found");
    });

    it("should persist updates in agent state", async () => {
      await agent.updateTrigger(triggerId, {
        status: "paused",
      });

      const triggers = await agent.listTriggers();
      expect(triggers[0].status).toBe("paused");
    });
  });

  describe("listTriggers", () => {
    it("should return empty array when no triggers exist", async () => {
      const triggers = await agent.listTriggers();
      expect(triggers).toEqual([]);
    });

    it("should return all triggers", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();

      await agent.createTrigger({
        payload: "Task 1",
        startTime,
      });

      await agent.createTrigger({
        payload: "Task 2",
        startTime,
      });

      await agent.createTrigger({
        payload: "Task 3",
        startTime,
      });

      const triggers = await agent.listTriggers();
      expect(triggers).toHaveLength(3);
      expect(triggers.map((t) => t.payload)).toEqual([
        "Task 1",
        "Task 2",
        "Task 3",
      ]);
    });

    it("should include all trigger fields", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();
      const rrule = "FREQ=DAILY;INTERVAL=1";

      await agent.createTrigger({
        payload: "Full trigger",
        startTime,
        rrule,
      });

      const triggers = await agent.listTriggers();
      expect(triggers[0]).toMatchObject({
        agentId,
        payload: "Full trigger",
        startTime,
        rrule,
        status: "active",
      });
      expect(triggers[0].id).toBeDefined();
      expect(triggers[0].createdAt).toBeDefined();
    });

    it("should reflect updates to triggers", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();

      const createResult = await agent.createTrigger({
        payload: "Task to update",
        startTime,
      });

      await agent.updateTrigger(createResult.trigger?.id, {
        status: "paused",
      });

      const triggers = await agent.listTriggers();
      expect(triggers[0].status).toBe("paused");
    });
  });

  describe("getStatus", () => {
    it("should return current agent state", async () => {
      const status = await agent.getStatus();

      expect(status).toMatchObject({
        agentId,
        taskDescription: "",
        status: "pending",
        result: null,
        triggers: [],
      });
    });

    it("should reflect trigger additions", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();

      await agent.createTrigger({
        payload: "Test trigger",
        startTime,
      });

      const status = await agent.getStatus();
      expect(status.triggers).toHaveLength(1);
    });
  });

  describe("trigger isolation", () => {
    it("should isolate triggers between different agent instances", async () => {
      const agent1Id = "agent-1";
      const agent2Id = "agent-2";

      // Get first agent instance
      const id1 = env.EXECUTION_AGENT.idFromName(agent1Id);
      const stub1 = env.EXECUTION_AGENT.get(id1);
      const agent1 = stub1 as unknown as ExecutionAgent;

      await agent1.setState({
        agentId: agent1Id,
        taskDescription: "",
        status: "pending",
        result: null,
        triggers: [],
      });

      // Get second agent instance
      const id2 = env.EXECUTION_AGENT.idFromName(agent2Id);
      const stub2 = env.EXECUTION_AGENT.get(id2);
      const agent2 = stub2 as unknown as ExecutionAgent;

      await agent2.setState({
        agentId: agent2Id,
        taskDescription: "",
        status: "pending",
        result: null,
        triggers: [],
      });

      const startTime = new Date(Date.now() + 3600000).toISOString();

      await agent1.createTrigger({
        payload: "Agent 1 task",
        startTime,
      });

      await agent2.createTrigger({
        payload: "Agent 2 task",
        startTime,
      });

      const triggers1 = await agent1.listTriggers();
      const triggers2 = await agent2.listTriggers();

      expect(triggers1).toHaveLength(1);
      expect(triggers2).toHaveLength(1);
      expect(triggers1[0].payload).toBe("Agent 1 task");
      expect(triggers2[0].payload).toBe("Agent 2 task");
    });

    it("should use same DO instance for same agent ID", async () => {
      const sharedAgentId = "shared-agent";

      // Get first reference
      const id1 = env.EXECUTION_AGENT.idFromName(sharedAgentId);
      const stub1 = env.EXECUTION_AGENT.get(id1);
      const agent1 = stub1 as unknown as ExecutionAgent;

      await agent1.setState({
        agentId: sharedAgentId,
        taskDescription: "",
        status: "pending",
        result: null,
        triggers: [],
      });

      // Get second reference to same agent
      const id2 = env.EXECUTION_AGENT.idFromName(sharedAgentId);
      const stub2 = env.EXECUTION_AGENT.get(id2);
      const agent2 = stub2 as unknown as ExecutionAgent;

      const startTime = new Date(Date.now() + 3600000).toISOString();

      await agent1.createTrigger({
        payload: "First trigger",
        startTime,
      });

      await agent2.createTrigger({
        payload: "Second trigger",
        startTime,
      });

      // Both should see all triggers since they share the same DO
      const triggers1 = await agent1.listTriggers();
      const triggers2 = await agent2.listTriggers();

      expect(triggers1).toHaveLength(2);
      expect(triggers2).toHaveLength(2);
      expect(triggers1).toEqual(triggers2);
    });
  });

  describe("edge cases", () => {
    it("should handle past start times", async () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

      const result = await agent.createTrigger({
        payload: "Past task",
        startTime: pastTime,
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.startTime).toBe(pastTime);
    });

    it("should handle empty payload", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();

      const result = await agent.createTrigger({
        payload: "",
        startTime,
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.payload).toBe("");
    });

    it("should handle very long payloads", async () => {
      const longPayload = "a".repeat(10000);
      const startTime = new Date(Date.now() + 3600000).toISOString();

      const result = await agent.createTrigger({
        payload: longPayload,
        startTime,
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.payload).toBe(longPayload);
    });

    it("should handle complex RRULE strings", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();
      const complexRrule =
        "FREQ=MONTHLY;BYDAY=2TU;BYMONTH=1,4,7,10;UNTIL=20251231T235959Z";

      const result = await agent.createTrigger({
        payload: "Quarterly meeting",
        startTime,
        rrule: complexRrule,
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.rrule).toBe(complexRrule);
    });

    it("should handle updating same trigger multiple times", async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();

      const createResult = await agent.createTrigger({
        payload: "Task",
        startTime,
      });

      const triggerId = createResult.trigger?.id;

      await agent.updateTrigger(triggerId, { status: "paused" });
      await agent.updateTrigger(triggerId, { status: "active" });
      await agent.updateTrigger(triggerId, { status: "paused" });

      const triggers = await agent.listTriggers();
      expect(triggers[0].status).toBe("paused");
    });
  });
});
