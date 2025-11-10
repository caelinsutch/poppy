import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { SharedHonoEnv } from "../types";

/**
 * Default CORS middleware with common settings
 */
export function withDefaultCors<E extends SharedHonoEnv>(
  options?: Parameters<typeof cors>[0],
): MiddlewareHandler<{ Bindings: E }> {
  return cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
    ...options,
  });
}
