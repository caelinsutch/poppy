import { WorkerEntrypoint } from "cloudflare:workers";
import {
  useWorkersLogger,
  withDefaultCors,
  withNotFound,
  withOnError,
} from "@poppy/hono-helpers";
import { loopMessageWebhookPayloadSchema } from "@poppy/schemas";
import { Hono } from "hono";
import type { App, WorkerEnv } from "./context";
import { createDatabaseClient } from "./db/client";
import { logger } from "./helpers/logger";
import { handleMessageInbound } from "./services/loop/loop-message-inbound-handler";
import {
  type AgentCompletionInput,
  processAgentCompletion,
} from "./services/process-message/process-agent-completion";

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

// Webhook handler at root
app.post("/", async (c) => {
  const body = await c.req.json();
  const webhookLogger = logger.withTags({ module: "webhook-handler" });
  webhookLogger.info("Received webhook payload", { body });

  const validation = loopMessageWebhookPayloadSchema.safeParse(body);

  if (!validation.success) {
    webhookLogger.error("Invalid webhook payload", {
      error: validation.error,
    });
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
        webhookLogger.info("Message sent successfully", {
          recipient: payload.recipient,
          success: payload.success,
          messageId: payload.message_id,
        });
        return c.json({ success: true, read: true });

      case "message_failed":
        webhookLogger.error("Message failed to send", {
          recipient: payload.recipient,
          errorCode: payload.error_code,
          messageId: payload.message_id,
        });
        return c.json({ success: true, read: true });

      case "message_timeout":
        webhookLogger.warn("Message timed out", {
          recipient: payload.recipient,
          errorCode: payload.error_code,
          messageId: payload.message_id,
        });
        break;

      case "message_reaction":
        webhookLogger.info("Received message reaction", {
          recipient: payload.recipient,
          reaction: payload.reaction,
          messageId: payload.message_id,
        });
        break;

      case "message_scheduled":
        webhookLogger.info("Message scheduled", {
          recipient: payload.recipient,
          messageId: payload.message_id,
        });
        break;

      case "group_created":
        webhookLogger.info("Group created", {
          groupId: payload.group.group_id,
          participants: payload.group.participants,
        });
        break;
    }

    webhookLogger.info("Processed webhook payload", { payload });

    return c.json({ success: true, typing: 8, read: true });
  } catch (error) {
    webhookLogger.error("Error processing webhook", { error });
    return c.json({ success: false }, 500);
  }
});

// Error handlers
app.onError(withOnError<App>());
app.notFound(withNotFound<App>());

// Default export: WorkerEntrypoint class for both HTTP and RPC
export default class extends WorkerEntrypoint<WorkerEnv> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env, this.ctx);
  }

  async handleAgentCompletion(input: AgentCompletionInput): Promise<void> {
    logger
      .withTags({ module: "rpc-handler" })
      .info("Received handleAgentCompletion RPC call", {
        agentId: input.agentId,
        conversationId: input.conversationId,
        success: input.success,
      });

    try {
      const db = createDatabaseClient(this.env);
      await processAgentCompletion(input, db, this.env);

      logger
        .withTags({ module: "rpc-handler" })
        .info("Successfully processed agent completion", {
          agentId: input.agentId,
          conversationId: input.conversationId,
        });
    } catch (error) {
      logger
        .withTags({ module: "rpc-handler" })
        .error("Failed to process agent completion", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          agentId: input.agentId,
          conversationId: input.conversationId,
        });
      throw error;
    }
  }
}
