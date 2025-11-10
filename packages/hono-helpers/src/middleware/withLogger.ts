import type { Context, MiddlewareHandler } from "hono";
import { useWorkersLogger as useWorkersLoggerBase } from "workers-tagged-logger";
import type { HonoApp } from "../types";
import { logger } from "../helpers/logger";
import { getRequestLogData } from "../helpers/request";

/**
 * Middleware to set up workers-tagged-logger for request logging
 */
export function useWorkersLogger<T extends HonoApp>(): MiddlewareHandler<T> {
  return async (c: Context<T>, next) => {
    const requestStartTimestamp = Date.now();

    // Set up the tagged logger middleware from workers-tagged-logger
    await useWorkersLoggerBase(c.env.NAME, {
      environment: c.env.NODE_ENV,
      release: c.env.SENTRY_RELEASE,
    })(c, next);

    // After the request is processed, log request data
    const logData = getRequestLogData(c, requestStartTimestamp);
    const duration = Date.now() - requestStartTimestamp;

    logger
      .withTags({
        url: logData.url,
        method: logData.method,
        path: logData.path,
        routePath: logData.routePath,
      })
      .info("Request processed", {
        ...logData,
        duration,
        status: c.res.status,
      });
  };
}
