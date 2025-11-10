import type { InferUITool, UITools } from "ai";
import type { createWebSearchTool } from "./web-search";

export type ToolTypes = {
  webSearch: ReturnType<typeof createWebSearchTool>;
};

export type UIToolTypes = {
  webSearch: InferUITool<ReturnType<typeof createWebSearchTool>>;
} & UITools;
