/**
 * Simple structured logger for Cloudflare Workers
 */
export interface LogContext {
  [key: string]: any;
}

export function createLogger(workerName: string, environment?: string) {
  const baseContext = {
    worker: workerName,
    environment: environment || "unknown",
  };

  return {
    info: (message: string, context?: LogContext) => {
      console.log(
        JSON.stringify({
          level: "info",
          message,
          ...baseContext,
          ...context,
          timestamp: new Date().toISOString(),
        }),
      );
    },

    error: (message: string, error?: Error, context?: LogContext) => {
      console.error(
        JSON.stringify({
          level: "error",
          message,
          error: error?.message,
          stack: error?.stack,
          ...baseContext,
          ...context,
          timestamp: new Date().toISOString(),
        }),
      );
    },

    warn: (message: string, context?: LogContext) => {
      console.warn(
        JSON.stringify({
          level: "warn",
          message,
          ...baseContext,
          ...context,
          timestamp: new Date().toISOString(),
        }),
      );
    },

    debug: (message: string, context?: LogContext) => {
      console.debug(
        JSON.stringify({
          level: "debug",
          message,
          ...baseContext,
          ...context,
          timestamp: new Date().toISOString(),
        }),
      );
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
