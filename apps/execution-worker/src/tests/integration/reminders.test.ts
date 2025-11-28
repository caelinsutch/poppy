import type { Reminder } from "@poppy/db";
import { describe, expect, it, vi } from "vitest";
import {
  createCancelReminderTool,
  createListRemindersTool,
  createSetReminderTool,
} from "../../tools/reminders";

describe("Reminder Tools", () => {
  describe("createSetReminderTool", () => {
    it("should schedule a reminder and save to database", async () => {
      const mockReminderId = "test-reminder-123";
      const mockScheduleId = "schedule-456";

      const scheduleCallback = vi.fn().mockResolvedValue(mockScheduleId);
      const saveToDbCallback = vi.fn().mockResolvedValue(mockReminderId);

      const tool = createSetReminderTool(scheduleCallback, saveToDbCallback);
      const result = await tool.execute?.(
        {
          task_description: "Check the weather forecast",
          delay_seconds: 300,
          reason: "User wants a weather update",
        },
        { toolCallId: "test", messages: [] },
      );

      expect(saveToDbCallback).toHaveBeenCalledOnce();
      expect(saveToDbCallback).toHaveBeenCalledWith({
        taskDescription: "Check the weather forecast",
        context: { reason: "User wants a weather update" },
        scheduledAt: expect.any(Date),
      });

      expect(scheduleCallback).toHaveBeenCalledOnce();
      expect(scheduleCallback).toHaveBeenCalledWith({
        delaySeconds: 300,
        reminderId: mockReminderId,
      });

      expect(result).toEqual({
        type: "reminder_scheduled",
        reminderId: mockReminderId,
        scheduledAt: expect.any(String),
        delaySeconds: 300,
      });
    });

    it("should handle reminder without reason", async () => {
      const mockReminderId = "test-reminder-456";
      const mockScheduleId = "schedule-789";

      const scheduleCallback = vi.fn().mockResolvedValue(mockScheduleId);
      const saveToDbCallback = vi.fn().mockResolvedValue(mockReminderId);

      const tool = createSetReminderTool(scheduleCallback, saveToDbCallback);
      const result = await tool.execute?.(
        {
          task_description: "Send follow-up email",
          delay_seconds: 3600,
        },
        { toolCallId: "test", messages: [] },
      );

      expect(saveToDbCallback).toHaveBeenCalledWith({
        taskDescription: "Send follow-up email",
        context: {},
        scheduledAt: expect.any(Date),
      });

      if (typeof result === "object" && "reminderId" in result) {
        expect(result.reminderId).toBe(mockReminderId);
        expect(result.delaySeconds).toBe(3600);
      }
    });

    it("should calculate correct scheduledAt time", async () => {
      const scheduleCallback = vi.fn().mockResolvedValue("schedule-id");
      const saveToDbCallback = vi.fn().mockResolvedValue("reminder-id");

      const beforeTime = Date.now();

      const tool = createSetReminderTool(scheduleCallback, saveToDbCallback);
      await tool.execute?.(
        {
          task_description: "Test timing",
          delay_seconds: 600,
        },
        { toolCallId: "test", messages: [] },
      );

      const afterTime = Date.now();

      const savedCall = saveToDbCallback.mock.calls[0][0];
      const scheduledAt = savedCall.scheduledAt.getTime();

      // scheduledAt should be roughly 600 seconds (600000ms) in the future
      expect(scheduledAt).toBeGreaterThanOrEqual(beforeTime + 600000);
      expect(scheduledAt).toBeLessThanOrEqual(afterTime + 600000);
    });
  });

  describe("createListRemindersTool", () => {
    it("should return list of pending reminders", async () => {
      const mockReminders: Reminder[] = [
        {
          id: "reminder-1",
          executionAgentDoId: "do-123",
          doScheduleId: "schedule-1",
          agentId: "agent-1",
          conversationId: "conv-1",
          taskDescription: "First reminder",
          context: { priority: "high" },
          scheduledAt: new Date("2025-01-01T12:00:00Z"),
          status: "pending",
          createdAt: new Date("2025-01-01T10:00:00Z"),
          processedAt: null,
          completedAt: null,
          errorMessage: null,
          retryCount: 0,
        },
        {
          id: "reminder-2",
          executionAgentDoId: "do-123",
          doScheduleId: "schedule-2",
          agentId: "agent-1",
          conversationId: "conv-1",
          taskDescription: "Second reminder",
          context: null,
          scheduledAt: new Date("2025-01-01T14:00:00Z"),
          status: "pending",
          createdAt: new Date("2025-01-01T11:00:00Z"),
          processedAt: null,
          completedAt: null,
          errorMessage: null,
          retryCount: 0,
        },
      ];

      const listCallback = vi.fn().mockResolvedValue(mockReminders);

      const tool = createListRemindersTool(listCallback);
      const result = await tool.execute?.(
        {},
        { toolCallId: "test", messages: [] },
      );

      expect(listCallback).toHaveBeenCalledOnce();
      expect(result).toEqual({
        type: "reminders_list",
        reminders: [
          {
            id: "reminder-1",
            taskDescription: "First reminder",
            scheduledAt: "2025-01-01T12:00:00.000Z",
            status: "pending",
            context: { priority: "high" },
          },
          {
            id: "reminder-2",
            taskDescription: "Second reminder",
            scheduledAt: "2025-01-01T14:00:00.000Z",
            status: "pending",
            context: null,
          },
        ],
        count: 2,
      });
    });

    it("should handle empty reminder list", async () => {
      const listCallback = vi.fn().mockResolvedValue([]);

      const tool = createListRemindersTool(listCallback);
      const result = await tool.execute?.(
        {},
        { toolCallId: "test", messages: [] },
      );

      expect(result).toEqual({
        type: "reminders_list",
        reminders: [],
        count: 0,
      });
    });
  });

  describe("createCancelReminderTool", () => {
    it("should successfully cancel a pending reminder", async () => {
      const cancelCallback = vi.fn().mockResolvedValue({
        success: true,
        message: "Reminder cancelled",
      });

      const tool = createCancelReminderTool(cancelCallback);
      const result = await tool.execute?.(
        { reminder_id: "550e8400-e29b-41d4-a716-446655440000" },
        { toolCallId: "test", messages: [] },
      );

      expect(cancelCallback).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
      );
      expect(result).toEqual({
        type: "reminder_cancelled",
        reminderId: "550e8400-e29b-41d4-a716-446655440000",
        success: true,
        message: "Reminder cancelled",
      });
    });

    it("should handle reminder not found", async () => {
      const cancelCallback = vi.fn().mockResolvedValue({
        success: false,
        message: "Reminder not found",
      });

      const tool = createCancelReminderTool(cancelCallback);
      const result = await tool.execute?.(
        { reminder_id: "550e8400-e29b-41d4-a716-446655440001" },
        { toolCallId: "test", messages: [] },
      );

      if (typeof result === "object" && "success" in result) {
        expect(result.success).toBe(false);
        expect(result.message).toBe("Reminder not found");
      }
    });

    it("should handle already processed reminder", async () => {
      const cancelCallback = vi.fn().mockResolvedValue({
        success: false,
        message: "Cannot cancel reminder with status: completed",
      });

      const tool = createCancelReminderTool(cancelCallback);
      const result = await tool.execute?.(
        { reminder_id: "550e8400-e29b-41d4-a716-446655440002" },
        { toolCallId: "test", messages: [] },
      );

      if (typeof result === "object" && "success" in result) {
        expect(result.success).toBe(false);
        expect(result.message).toBe(
          "Cannot cancel reminder with status: completed",
        );
      }
    });
  });
});
