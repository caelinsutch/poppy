import type { InferUITool, UITools } from "ai";
import type { webSearch } from "./web-search";

export type ToolTypes = {
  webSearch: typeof webSearch;
};

export type UIToolTypes = {
  webSearch: InferUITool<typeof webSearch>;
} & UITools;
