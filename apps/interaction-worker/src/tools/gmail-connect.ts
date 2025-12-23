import {
  createComposioClient,
  initiateGmailConnect,
} from "@poppy/clients/composio";
import { userGmailConnections } from "@poppy/db";
import { tool } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { WorkerEnv } from "../context";
import type { Database } from "../db/client";

/**
 * Tool for initiating Gmail OAuth connection via chat
 * Users can ask to connect their Gmail, and this tool will return an OAuth URL
 */
export const createGmailConnectTool = (
  db: Database,
  userId: string,
  env: WorkerEnv,
) => {
  return tool({
    description: `Connect a user's Gmail account via OAuth. Use this when the user asks to connect their Gmail, link their email, or wants to enable email features. Returns an OAuth URL that the user must click to authorize access.`,
    inputSchema: z.object({
      action: z
        .enum(["connect", "status", "disconnect"])
        .describe(
          "The action to perform: 'connect' to initiate OAuth, 'status' to check connection status, 'disconnect' to remove connection",
        ),
    }),
    execute: async ({ action }) => {
      const composioClient = createComposioClient({
        apiKey: env.COMPOSIO_API_KEY,
      });

      // Use the user's UUID as the Composio user ID
      const composioUserId = userId;

      if (action === "status") {
        // Check current connection status
        const existingConnection =
          await db.query.userGmailConnections.findFirst({
            where: eq(userGmailConnections.userId, userId),
            orderBy: desc(userGmailConnections.createdAt),
          });

        if (!existingConnection) {
          return {
            type: "gmail_status" as const,
            connected: false,
            message:
              "No Gmail account connected. Ask if they'd like to connect one.",
          };
        }

        if (existingConnection.status === "active") {
          return {
            type: "gmail_status" as const,
            connected: true,
            email: existingConnection.email,
            message: `Gmail connected: ${existingConnection.email}`,
          };
        }

        if (existingConnection.status === "pending") {
          return {
            type: "gmail_status" as const,
            connected: false,
            pending: true,
            message:
              "Gmail connection is pending. The user may need to complete the OAuth flow.",
          };
        }

        return {
          type: "gmail_status" as const,
          connected: false,
          status: existingConnection.status,
          message: `Gmail connection status: ${existingConnection.status}`,
        };
      }

      if (action === "disconnect") {
        // Find and remove connection
        const existingConnection =
          await db.query.userGmailConnections.findFirst({
            where: eq(userGmailConnections.userId, userId),
          });

        if (!existingConnection) {
          return {
            type: "gmail_disconnect" as const,
            success: false,
            message: "No Gmail account connected.",
          };
        }

        await db
          .update(userGmailConnections)
          .set({ status: "disconnected", updatedAt: new Date() })
          .where(eq(userGmailConnections.id, existingConnection.id));

        return {
          type: "gmail_disconnect" as const,
          success: true,
          message: "Gmail account disconnected successfully.",
        };
      }

      // action === "connect"
      // Check if user already has an active connection
      const existingConnection = await db.query.userGmailConnections.findFirst({
        where: eq(userGmailConnections.userId, userId),
        orderBy: desc(userGmailConnections.createdAt),
      });

      if (existingConnection?.status === "active") {
        return {
          type: "gmail_already_connected" as const,
          email: existingConnection.email,
          message: `Gmail is already connected (${existingConnection.email}). Ask if they want to reconnect or disconnect.`,
        };
      }

      try {
        // Initiate OAuth flow with Composio
        const connectionRequest = await initiateGmailConnect(
          composioClient,
          composioUserId,
          env.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
        );

        // Store the pending connection in the database
        if (existingConnection) {
          // Update existing record
          await db
            .update(userGmailConnections)
            .set({
              status: "pending",
              connectionRequestId: connectionRequest.id,
              updatedAt: new Date(),
            })
            .where(eq(userGmailConnections.id, existingConnection.id));
        } else {
          // Create new record
          await db.insert(userGmailConnections).values({
            userId,
            composioUserId,
            connectionRequestId: connectionRequest.id,
            status: "pending",
          });
        }

        return {
          type: "gmail_connect_initiated" as const,
          redirectUrl: connectionRequest.redirectUrl,
          message: `To connect your Gmail, please click this link and authorize access: ${connectionRequest.redirectUrl}`,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          type: "gmail_connect_error" as const,
          error: errorMessage,
          message: `Failed to initiate Gmail connection: ${errorMessage}`,
        };
      }
    },
  });
};
