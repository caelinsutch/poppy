import {
  useWorkersLogger,
  withDefaultCors,
  withNotFound,
  withOnError,
} from "@poppy/hono-helpers";
import { loopMessageWebhookPayloadSchema } from "@poppy/schemas";
import { Hono } from "hono";
import type { App } from "./context";
import { createDatabaseClient } from "./db/client";
import { handleMessageInbound } from "./services/loop/loop-message-inbound-handler";

// Export Durable Object
export { MessageDebouncer } from "./durable-objects/message-debouncer";

const app = new Hono<App>();

// Middleware
app.use("*", useWorkersLogger());
app.use("*", withDefaultCors());

// Health check route with DB call
app.get("/health", async (c) => {
  try {
    const db = createDatabaseClient(c.env);
    // Simple query to verify DB connection
    await db.execute("SELECT 1");

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed", error);
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

// Webhook handler at root
app.post("/", async (c) => {
  console.log(c.env);
  const body = await c.req.json();
  console.log("Received webhook payload", body);

  const validation = loopMessageWebhookPayloadSchema.safeParse(body);

  if (!validation.success) {
    console.error("Invalid webhook payload", { error: validation.error });
    return c.json({ success: false }, 400);
  }

  const payload = validation.data;

  try {
    switch (payload.alert_type) {
      case "message_inbound": {
        // Create database client for this request
        const db = createDatabaseClient(c.env);

        // Use waitUntil to process message after response is sent
        c.executionCtx.waitUntil(
          handleMessageInbound({
            payload,
            rawPayload: body,
            doNamespace: c.env.MESSAGE_DEBOUNCER,
            db,
            ctx: c.executionCtx,
            env: c.env,
          }),
        );
        break;
      }

      case "message_sent":
        console.log("Message sent successfully", {
          recipient: payload.recipient,
          success: payload.success,
          message_id: payload.message_id,
        });
        return c.json({ success: true, read: true });

      case "message_failed":
        console.error("Message failed to send", {
          recipient: payload.recipient,
          error_code: payload.error_code,
          message_id: payload.message_id,
        });
        return c.json({ success: true, read: true });

      case "message_timeout":
        console.warn("Message timed out", {
          recipient: payload.recipient,
          error_code: payload.error_code,
          message_id: payload.message_id,
        });
        break;

      case "message_reaction":
        console.log("Received message reaction", {
          recipient: payload.recipient,
          reaction: payload.reaction,
          message_id: payload.message_id,
        });
        break;

      case "message_scheduled":
        console.log("Message scheduled", {
          recipient: payload.recipient,
          message_id: payload.message_id,
        });
        break;

      case "group_created":
        console.log("Group created", {
          group_id: payload.group.group_id,
          participants: payload.group.participants,
        });
        break;
    }

    console.log("Processed webhook payload", { payload });

    return c.json({ success: true, typing: 8, read: true });
  } catch (error) {
    console.error("Error processing webhook", error);
    return c.json({ success: false }, 500);
  }
});

// Error handlers
app.onError(withOnError<App>());
app.notFound(withNotFound<App>());

export default app;
