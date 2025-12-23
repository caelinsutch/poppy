// ExecutionAgent state - minimal, only tracks if currently executing
export type ExecutionState = {
  isExecuting: boolean;
};

// Input for executeTask callable
export type TaskInput = {
  agentId: string;
  taskDescription: string;
  conversationId: string;
  // User's timezone for time-aware task execution (e.g., "America/Los_Angeles")
  userTimezone?: string;
  // User ID for looking up integrations like Gmail
  userId?: string;
};

// Payload for reminder callbacks (passed to processReminder via schedule())
export type ReminderPayload = {
  reminderId: string;
};
