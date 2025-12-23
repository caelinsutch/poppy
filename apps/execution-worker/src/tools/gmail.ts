import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import type { getDb } from "@poppy/db";
import { userGmailConnections } from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

type Database = ReturnType<typeof getDb>;

// Gmail tool names available from Composio
const GMAIL_TOOLS = [
  "GMAIL_SEND_EMAIL",
  "GMAIL_CREATE_EMAIL_DRAFT",
  "GMAIL_SEND_DRAFT",
  "GMAIL_REPLY_TO_THREAD",
  "GMAIL_FORWARD_MESSAGE",
  "GMAIL_LIST_DRAFTS",
  "GMAIL_FETCH_EMAILS",
  "GMAIL_GET_PROFILE",
] as const;

/**
 * Creates Gmail tools using Composio's Vercel provider
 * The tools are automatically formatted for use with Vercel AI SDK
 */
export const createGmailTools = async (
  apiKey: string,
  composioUserId: string,
) => {
  try {
    const composio = new Composio({
      apiKey,
      provider: new VercelProvider(),
    });

    // Get pre-configured Gmail tools from Composio
    const tools = await composio.tools.get(composioUserId, {
      tools: [...GMAIL_TOOLS],
    });

    logger.info("Successfully loaded Gmail tools from Composio", {
      toolCount: Object.keys(tools).length,
      composioUserId,
    });

    return tools;
  } catch (error) {
    logger.error("Failed to load Gmail tools from Composio", {
      error: error instanceof Error ? error.message : String(error),
      composioUserId,
    });
    return {};
  }
};

/**
 * Creates a wrapper tool that checks Gmail connection status
 * and provides helpful messages when Gmail is not connected
 */
export const createGmailCheckTool = (db: Database, userId: string) => {
  return tool({
    description: `Check if the user has Gmail connected. Use this before attempting any email operations to ensure the user has authorized Gmail access.`,
    inputSchema: z.object({}),
    execute: async () => {
      const connection = await db.query.userGmailConnections.findFirst({
        where: eq(userGmailConnections.userId, userId),
      });

      if (!connection) {
        return {
          type: "gmail_not_connected" as const,
          connected: false,
          message:
            "Gmail is not connected. Please ask the user to connect their Gmail first using the interaction agent.",
        };
      }

      if (connection.status !== "active") {
        return {
          type: "gmail_not_active" as const,
          connected: false,
          status: connection.status,
          message: `Gmail connection status is '${connection.status}'. The user may need to complete the OAuth flow or reconnect.`,
        };
      }

      return {
        type: "gmail_connected" as const,
        connected: true,
        email: connection.email,
        composioUserId: connection.composioUserId,
        message: `Gmail is connected (${connection.email}). You can now use Gmail tools.`,
      };
    },
  });
};

/**
 * Gets the Composio user ID for a given Poppy user ID
 * Returns null if no Gmail connection exists
 */
export const getComposioUserIdForUser = async (
  db: Database,
  userId: string,
): Promise<string | null> => {
  const connection = await db.query.userGmailConnections.findFirst({
    where: eq(userGmailConnections.userId, userId),
  });

  if (!connection || connection.status !== "active") {
    return null;
  }

  return connection.composioUserId;
};
