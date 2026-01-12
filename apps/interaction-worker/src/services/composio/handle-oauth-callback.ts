import {
  createComposioClient,
  waitForGmailConnection,
} from "@poppy/clients/composio";
import {
  conversationParticipants,
  conversations,
  userGmailConnections,
} from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { desc, eq } from "drizzle-orm";
import type { WorkerEnv } from "../../context";
import type { Database } from "../../db/client";
import { sendLoopMessage } from "../loop/send-loop-message";

export const handleComposioWebhook = async (
  payload: {
    connectionId: string;
    status: "ACTIVE" | "FAILED";
    email?: string;
    userId?: string;
  },
  db: Database,
  _env: WorkerEnv,
) => {
  const webhookLogger = logger.withTags({ module: "composio-webhook" });

  webhookLogger.info("Processing Composio webhook", {
    connectionId: payload.connectionId,
    status: payload.status,
  });

  const connection = await db.query.userGmailConnections.findFirst({
    where: eq(userGmailConnections.connectionRequestId, payload.connectionId),
  });

  if (!connection) {
    webhookLogger.warn("No pending connection found for webhook", {
      connectionId: payload.connectionId,
    });
    return { success: false, message: "Connection not found" };
  }

  if (payload.status === "ACTIVE") {
    await db
      .update(userGmailConnections)
      .set({
        status: "active",
        connectionId: payload.connectionId,
        email: payload.email,
        updatedAt: new Date(),
      })
      .where(eq(userGmailConnections.id, connection.id));

    webhookLogger.info("Gmail connection activated", {
      userId: connection.userId,
      email: payload.email,
    });

    const userConversation = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .innerJoin(
        conversations,
        eq(conversations.id, conversationParticipants.conversationId),
      )
      .where(eq(conversationParticipants.userId, connection.userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);

    if (userConversation.length > 0) {
      const conversationId = userConversation[0].conversationId;

      try {
        await sendLoopMessage({
          text: `Got it, you're all set! Want me to catch you up on your inbox?`,
          conversationId,
          db,
        });

        webhookLogger.info("Sent Gmail welcome message", {
          userId: connection.userId,
          conversationId,
        });
      } catch (error) {
        webhookLogger.error("Failed to send Gmail welcome message", {
          error: error instanceof Error ? error.message : String(error),
          userId: connection.userId,
        });
      }
    }

    return { success: true, message: "Connection activated" };
  }

  await db
    .update(userGmailConnections)
    .set({
      status: "failed",
      updatedAt: new Date(),
    })
    .where(eq(userGmailConnections.id, connection.id));

  webhookLogger.warn("Gmail connection failed", {
    userId: connection.userId,
  });

  return { success: true, message: "Connection marked as failed" };
};

export const pollConnectionStatus = async (
  connectionRequestId: string,
  db: Database,
  env: WorkerEnv,
) => {
  const pollLogger = logger.withTags({ module: "composio-poll" });

  const connection = await db.query.userGmailConnections.findFirst({
    where: eq(userGmailConnections.connectionRequestId, connectionRequestId),
  });

  if (!connection || connection.status !== "pending") {
    return null;
  }

  try {
    const composioClient = createComposioClient({
      apiKey: env.COMPOSIO_API_KEY,
    });

    const status = await waitForGmailConnection(
      composioClient,
      connectionRequestId,
    );

    if (status.status === "ACTIVE") {
      await db
        .update(userGmailConnections)
        .set({
          status: "active",
          connectionId: status.id,
          email: status.email,
          updatedAt: new Date(),
        })
        .where(eq(userGmailConnections.id, connection.id));

      pollLogger.info("Gmail connection activated via polling", {
        userId: connection.userId,
        email: status.email,
      });

      return { status: "active", email: status.email };
    }

    if (status.status === "FAILED") {
      await db
        .update(userGmailConnections)
        .set({
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(userGmailConnections.id, connection.id));

      return { status: "failed" };
    }

    return { status: "pending" };
  } catch (error) {
    pollLogger.error("Failed to poll connection status", {
      error: error instanceof Error ? error.message : String(error),
      connectionRequestId,
    });
    return null;
  }
};
