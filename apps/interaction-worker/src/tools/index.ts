import type { InferUITool, UITools } from "ai";
import type { createSendMessageToAgentTool } from "./send-message-to-agent";
import type { createWebSearchTool } from "./web-search";

export type ToolTypes = {
  webSearch: ReturnType<typeof createWebSearchTool>;
  sendMessageToAgent: ReturnType<typeof createSendMessageToAgentTool>;
};

export type UIToolTypes = {
  webSearch: InferUITool<ReturnType<typeof createWebSearchTool>>;
  sendMessageToAgent: InferUITool<
    ReturnType<typeof createSendMessageToAgentTool>
  >;
} & UITools;

export * from "./send-message-to-agent";
export * from "./send-message-to-user";
export * from "./wait";
export * from "./web-search";
