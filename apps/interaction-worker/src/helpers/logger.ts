import { logger as baseLogger } from "@poppy/hono-helpers";

/**
 * Logger instance for the interaction worker with proper tags
 */
export const logger = baseLogger.withTags({
  worker: "poppy-interaction",
  service: "interaction",
});

/**
 * Create a logger with module tag
 */
export function createModuleLogger(module: string) {
  return logger.withTags({ module });
}
