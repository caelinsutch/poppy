import { logger as baseLogger } from "@poppy/hono-helpers";

/**
 * Logger instance for the execution worker with proper tags
 */
export const logger = baseLogger.withTags({
  worker: "poppy-execution",
  service: "execution",
});

/**
 * Create a logger with module tag
 */
export function createModuleLogger(module: string) {
  return logger.withTags({ module });
}
