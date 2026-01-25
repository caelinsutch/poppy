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
    const rawBody = await c.req.text();
    webhookLogger.info("Received raw Composio webhook", {
      rawBody: rawBody.substring(0, 1000),
      contentType: c.req.header("content-type"),
      url: c.req.url,
    });

    const body = JSON.parse(rawBody);

    webhookLogger.info("Parsed Composio webhook", {
      event: body.event,
      type: body.type,
      triggerName: body.data?.triggerName,
      connectionId: body.connectionId || body.data?.connection_id,
      status: body.status,
      keys: Object.keys(body),
    });

    const result = await handleComposioWebhook(body, c.env);
    return c.json(result);
  } catch (error) {
    webhookLogger.error("Error processing Composio webhook", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return c.json({ success: false, message: "Internal error" }, 500);
  }
});

// Error handlers
app.onError(withOnError<App>());
app.notFound(withNotFound<App>());

export default app;
