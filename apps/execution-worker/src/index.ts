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
import { handleComposioWebhook } from "./services/composio-webhook-handler";

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

app.post("/api/webhooks/composio", async (c) => {
  const webhookLogger = logger.withTags({ module: "composio-webhook" });

  try {
    const body = await c.req.json();

    webhookLogger.info("Received Composio webhook", {
      event: body.event,
      triggerName: body.data?.triggerName,
    });

    const result = await handleComposioWebhook(body, c.env);
    return c.json(result);
  } catch (error) {
    webhookLogger.error("Error processing Composio webhook", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ success: false, message: "Internal error" }, 500);
  }
});

// Error handlers
app.onError(withOnError<App>());
app.notFound(withNotFound<App>());

export default app;
