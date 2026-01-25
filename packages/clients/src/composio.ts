import { Composio } from "@composio/core";

export interface ComposioClientConfig {
  apiKey: string;
}

export interface ConnectionInfo {
  app: string;
  connectionId: string;
  status: string;
}

/**
 * Create a Composio client instance
 */
export const createComposioClient = (config: ComposioClientConfig) => {
  return new Composio({ apiKey: config.apiKey });
};

/**
 * Get all active connections for a user from Composio.
 * Uses the userId as the Composio entity ID.
 */
export const getUserConnections = async (
  apiKey: string,
  userId: string,
): Promise<ConnectionInfo[]> => {
  try {
    const composio = new Composio({ apiKey });

    const connections = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    return (
      connections.items
        ?.filter((conn) => conn.status === "ACTIVE")
        .map((conn) => ({
          app:
            conn.appName || conn.appUniqueId || conn.toolkit?.slug || "unknown",
          connectionId: conn.id,
          status: conn.status,
        })) || []
    );
  } catch {
    return [];
  }
};

/**
 * Check if a user has an active connection for a specific app.
 */
export const checkUserConnection = async (
  apiKey: string,
  userId: string,
  app: string,
): Promise<{ connected: boolean; connectionId?: string }> => {
  const connections = await getUserConnections(apiKey, userId);
  const connection = connections.find(
    (conn) => conn.app.toLowerCase() === app.toLowerCase(),
  );

  if (connection) {
    return { connected: true, connectionId: connection.connectionId };
  }

  return { connected: false };
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
  console.log("[Composio] initiateConnection called", {
    userId,
    authConfigId,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey?.substring(0, 8),
  });

  try {
    const composio = new Composio({ apiKey });
    console.log("[Composio] Client created, calling initiate...");

    const connectionRequest = await composio.connectedAccounts.initiate(
      userId,
      authConfigId,
    );

    console.log("[Composio] initiate response:", {
      hasRedirectUrl: !!connectionRequest.redirectUrl,
      redirectUrl: connectionRequest.redirectUrl,
      id: connectionRequest.id,
      fullResponse: JSON.stringify(connectionRequest),
    });

    return {
      redirectUrl: connectionRequest.redirectUrl || "",
      connectionId: connectionRequest.id || "",
    };
  } catch (error) {
    console.error("[Composio] initiateConnection error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error,
    });
    return null;
  }
};

/**
 * Disconnect an account by connection ID.
 */
export const disconnectAccount = async (
  apiKey: string,
  connectionId: string,
): Promise<boolean> => {
  try {
    const composio = new Composio({ apiKey });
    await composio.connectedAccounts.delete(connectionId);
    return true;
  } catch {
    return false;
  }
};

export type ComposioClient = ReturnType<typeof createComposioClient>;
