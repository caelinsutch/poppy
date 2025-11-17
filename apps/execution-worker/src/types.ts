// ExecutionAgent state - minimal, only tracks if currently executing
export type ExecutionState = {
  isExecuting: boolean;
};

// Input for executeTask callable
export type TaskInput = {
  agentId: string;
  taskDescription: string;
  conversationId: string;
};
