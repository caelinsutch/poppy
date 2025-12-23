import { Composio } from "@composio/core";

export interface ComposioClientConfig {
  apiKey: string;
}

export interface GmailConnectionRequest {
  redirectUrl: string;
  id: string;
}

export interface GmailConnectionStatus {
  id: string;
  status: "ACTIVE" | "PENDING" | "FAILED" | "DISCONNECTED";
  email?: string;
}

/**
 * Create a Composio client instance
 */
export const createComposioClient = (config: ComposioClientConfig) => {
  return new Composio({ apiKey: config.apiKey });
};

/**
 * Initiate Gmail OAuth connection for a user
 * Returns the redirect URL for the user to authorize
 */
export const initiateGmailConnect = async (
  client: Composio,
  userId: string,
  authConfigId: string,
): Promise<GmailConnectionRequest> => {
  const connectionRequest = await client.connectedAccounts.link(
    userId,
    authConfigId,
  );

  return {
    redirectUrl: connectionRequest.redirectUrl ?? "",
    id: connectionRequest.id ?? "",
  };
};

/**
 * Wait for a Gmail connection to be established
 * This blocks until the user completes OAuth or times out
 */
export const waitForGmailConnection = async (
  client: Composio,
  connectionRequestId: string,
  _timeoutMs = 300000, // 5 minutes default
): Promise<GmailConnectionStatus> => {
  const connectedAccount =
    await client.connectedAccounts.get(connectionRequestId);

  return {
    id: connectedAccount.id,
    status: connectedAccount.status as GmailConnectionStatus["status"],
    email: (connectedAccount as any).email,
  };
};

/**
 * Check the status of a Gmail connection for a user
 */
export const getGmailConnectionStatus = async (
  client: Composio,
  userId: string,
): Promise<GmailConnectionStatus | null> => {
  try {
    const connections = await client.connectedAccounts.list({
      userIds: [userId],
    });

    const activeConnection = connections.items?.find(
      (conn) => conn.status === "ACTIVE",
    );

    if (!activeConnection) {
      return null;
    }

    return {
      id: activeConnection.id,
      status: activeConnection.status as GmailConnectionStatus["status"],
      email: (activeConnection as any).email,
    };
  } catch {
    return null;
  }
};

/**
 * Disconnect a Gmail account
 */
export const disconnectGmail = async (
  client: Composio,
  connectionId: string,
): Promise<void> => {
  await client.connectedAccounts.delete(connectionId);
};

export type ComposioClient = ReturnType<typeof createComposioClient>;
