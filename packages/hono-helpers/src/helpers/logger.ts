import { WorkersLogger } from "workers-tagged-logger";

export type LogTagHints = {
  // add common tags here so that they show up as hints
  // in `logger.setTags()` and `logger.withTags()`
  url: string;
  method: string;
  path: string;
  routePath: string;
  searchParams: string;
  headers: string;
  ip?: string;
  timestamp: string;
};

export const logger = new WorkersLogger<LogTagHints>();
