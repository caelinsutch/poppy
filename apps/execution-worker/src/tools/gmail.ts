import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { logger } from "@poppy/hono-helpers";

/**
 * Gets Gmail tools from Composio for use with Vercel AI SDK.
 * Uses the user's Poppy userId as the Composio userId.
 */
export const getComposioTools = async (
  apiKey: string,
  userId: string,
  toolkits: string[] = ["gmail"],
) => {
  try {
    const composio = new Composio({
      apiKey,
      provider: new VercelProvider(),
    });

    // Get tools using toolkits - userId must have an active connection
    const tools = await composio.tools.get(userId, {
      toolkits,
    });

    logger.info("Successfully loaded Composio tools", {
      toolCount: Object.keys(tools).length,
      toolkits,
      userId,
    });

    return tools;
  } catch (error) {
    logger.error("Failed to load Composio tools", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      toolkits,
    });
    return {};
  }
};

/**
 * Check if a user has an active connection for a specific app.
 * Returns connection details from Composio's API.
 */
export const checkUserConnection = async (
  apiKey: string,
  userId: string,
  app: string = "gmail",
): Promise<{
  connected: boolean;
  email?: string;
  connectionId?: string;
}> => {
  try {
    const composio = new Composio({ apiKey });

    const connections = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    const connection = connections.items?.find(
      (conn) =>
        conn.status === "ACTIVE" &&
        conn.toolkit?.slug?.toLowerCase() === app.toLowerCase(),
    );

    if (connection) {
      return {
        connected: true,
        connectionId: connection.id,
      };
    }

    return { connected: false };
  } catch (error) {
    logger.error("Failed to check user connection", {
      error: error instanceof Error ? error.message : String(error),
      userId,
      app,
    });
    return { connected: false };
  }
};

/**
 * Get all active connections for a user from Composio.
 */
export const getUserConnections = async (
  apiKey: string,
  userId: string,
): Promise<
  Array<{
    app: string;
    connectionId: string;
  }>
> => {
  try {
    const composio = new Composio({ apiKey });

    const connections = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    return (
      connections.items
        ?.filter((conn) => conn.status === "ACTIVE")
        .map((conn) => ({
          app: conn.toolkit?.slug || "unknown",
          connectionId: conn.id,
        })) || []
    );
  } catch (error) {
    logger.error("Failed to get user connections", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return [];
  }
};

/**
 * Initiate a connection for a user to an app.
 * Returns the OAuth redirect URL.
 */
export const initiateConnection = async (
  apiKey: string,
  userId: string,
  authConfigId: string,
): Promise<{ redirectUrl: string; connectionId: string } | null> => {
  try {
    const composio = new Composio({ apiKey });

    const result = await composio.connectedAccounts.link(userId, authConfigId);

    logger.info("Initiated Composio connection", {
      userId,
      connectionId: result.id,
    });

    return {
      redirectUrl: result.redirectUrl || "",
      connectionId: result.id || "",
    };
  } catch (error) {
    logger.error("Failed to initiate connection", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return null;
  }
};
