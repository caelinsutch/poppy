export type TaskStatus = "pending" | "running" | "completed" | "failed";

export type ExecutionState = {
  agentId: string;
  taskDescription: string;
  status: TaskStatus;
  result: unknown;
  triggers: Trigger[];
};

export type Trigger = {
  id: string;
  agentId: string;
  payload: string;
  startTime: string; // ISO 8601
  rrule?: string; // iCalendar RRULE for recurrence
  status: "active" | "paused";
  createdAt: string;
  lastRunAt?: string;
};

export type TaskInput = {
  agentId: string;
  taskDescription: string;
  conversationId: string;
};
