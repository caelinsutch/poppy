import {
  type LoopMessageSendResponse,
  loopMessageSendRequestSchema,
  loopMessageWebhookPayloadSchema,
} from "@poppy/schemas";
import { Hono } from "hono";
import { createLoopClient } from "../clients/loop-message";
import type { App } from "../context";
import { createDatabaseClient } from "../db/client";
import { handleMessageInbound } from "../services/loop/loop-message-inbound-handler";

export const loopMessageRoutes = new Hono<App>();

loopMessageRoutes.post("/messages/send", async (c) => {
  const body = await c.req.json();
  const validation = loopMessageSendRequestSchema.safeParse(body);

  if (!validation.success) {
    return c.json<LoopMessageSendResponse>(
      {
        success: false,
        error: "Validation error",
        message: validation.error.message,
      },
      400,
    );
  }

  try {
    const loopClient = createLoopClient(c.env);
    const response = await loopClient.sendMessage(validation.data);
    return c.json(response);
  } catch (error) {
    console.error("Error sending message via Loop Message API", error);
    return c.json<LoopMessageSendResponse>(
      {
        success: false,
        error: "Internal server error",
      },
      500,
    );
  }
});

loopMessageRoutes.post("/webhooks/loop-message", async (c) => {
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
