import {
  useWorkersLogger,
  withDefaultCors,
  withNotFound,
  withOnError,
} from "@poppy/hono-helpers";
import { Hono } from "hono";
import type { App } from "./context";
import { createDatabaseClient } from "./db/client";
import { logger } from "./helpers/logger";

// Export Durable Object
export { ExecutionAgent } from "./durable-objects/execution-agent";

const app = new Hono<App>();

// Middleware
app.use("*", useWorkersLogger());
app.use("*", withDefaultCors());

// Health check route with DB call
app.get("/health", async (c) => {
  try {
    logger.withTags({ module: "health-check" }).info("Health check started", {
      env: c.env,
    });
    const db = createDatabaseClient(c.env);
    // Simple query to verify DB connection
    await db.execute("SELECT 1");

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error) {
    logger
      .withTags({ module: "health-check" })
      .error("Health check failed", { error });
    return c.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      503,
    );
  }
});

// Error handlers
app.onError(withOnError<App>());
app.notFound(withNotFound<App>());

export default app;
