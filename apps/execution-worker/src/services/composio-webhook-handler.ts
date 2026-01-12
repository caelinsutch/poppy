import {
  agents,
  conversationParticipants,
  conversations,
  getDb,
  userGmailConnections,
} from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { desc, eq } from "drizzle-orm";
import type { WorkerEnv } from "../context";

type Database = ReturnType<typeof getDb>;

type OAuthCallbackPayload = {
  connectionId: string;
  status: "ACTIVE" | "FAILED";
  email?: string;
  userId?: string;
};

type EmailTriggerPayload = {
  event: "trigger";
  data: {
    triggerName: string;
    payload: {
      messageId: string;
      threadId: string;
      labelIds: string[];
      snippet: string;
      historyId: string;
      internalDate: string;
      payload: {
        headers: Array<{ name: string; value: string }>;
        body?: { data?: string };
        parts?: Array<{
          mimeType: string;
          body?: { data?: string };
        }>;
      };
    };
    entityId: string;
  };
};

type ComposioWebhookPayload = OAuthCallbackPayload | EmailTriggerPayload;

const isEmailTrigger = (
  payload: ComposioWebhookPayload,
): payload is EmailTriggerPayload => {
  return "event" in payload && payload.event === "trigger";
};

export const handleComposioWebhook = async (
  payload: ComposioWebhookPayload,
  env: WorkerEnv,
): Promise<{ success: boolean; message: string }> => {
  const webhookLogger = logger.withTags({ module: "composio-webhook" });

  webhookLogger.info("Processing Composio webhook", { payload });

  if (isEmailTrigger(payload)) {
    return handleEmailTrigger(payload, env);
  }

  return handleOAuthCallback(payload, env);
};

const handleOAuthCallback = async (
  payload: OAuthCallbackPayload,
  env: WorkerEnv,
): Promise<{ success: boolean; message: string }> => {
  const webhookLogger = logger.withTags({ module: "composio-oauth" });

  webhookLogger.info("Processing OAuth callback", {
    connectionId: payload.connectionId,
    status: payload.status,
  });

  const db = getDb(env.HYPERDRIVE.connectionString);

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

    await sendWelcomeMessage(connection.userId, db, env);

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

const sendWelcomeMessage = async (
  userId: string,
  db: Database,
  env: WorkerEnv,
): Promise<void> => {
  const notifyLogger = logger.withTags({ module: "gmail-welcome" });

  const userConversation = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(
      conversations,
      eq(conversations.id, conversationParticipants.conversationId),
    )
    .where(eq(conversationParticipants.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  if (userConversation.length === 0) {
    notifyLogger.warn("No conversation found for user", { userId });
    return;
  }

  const conversationId = userConversation[0].conversationId;

  const interactionAgent = await db.query.agents.findFirst({
    where: eq(agents.conversationId, conversationId),
  });

  if (!interactionAgent) {
    notifyLogger.warn("No interaction agent found", { conversationId });
    return;
  }

  const taskDescription = `[GMAIL CONNECTED] The user just connected their Gmail account. Send them a brief welcome message like "Got it, you're all set! Want me to catch you up on your inbox?"`;

  const executionAgentId = env.EXECUTION_AGENT.idFromName(interactionAgent.id);
  const executionAgent = env.EXECUTION_AGENT.get(executionAgentId);

  try {
    await executionAgent.executeTask({
      agentId: interactionAgent.id,
      conversationId,
      taskDescription,
      userId,
    });

    notifyLogger.info("Gmail welcome task dispatched", { userId });
  } catch (error) {
    notifyLogger.error("Failed to dispatch welcome task", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
  }
};

const handleEmailTrigger = async (
  payload: EmailTriggerPayload,
  env: WorkerEnv,
): Promise<{ success: boolean; message: string }> => {
  const emailLogger = logger.withTags({ module: "email-trigger" });

  if (payload.data?.triggerName !== "GMAIL_NEW_GMAIL_MESSAGE") {
    emailLogger.info("Ignoring non-email trigger", {
      triggerName: payload.data?.triggerName,
    });
    return { success: true, message: "Event ignored" };
  }

  const db = getDb(env.HYPERDRIVE.connectionString);
  const composioUserId = payload.data.entityId;

  const gmailConnection = await db.query.userGmailConnections.findFirst({
    where: eq(userGmailConnections.composioUserId, composioUserId),
  });

  if (!gmailConnection) {
    emailLogger.warn("No Gmail connection found", { composioUserId });
    return { success: false, message: "Gmail connection not found" };
  }

  const emailPayload = payload.data.payload;
  const headers = emailPayload.payload.headers;

  const emailInfo = {
    messageId: emailPayload.messageId,
    threadId: emailPayload.threadId,
    from: extractHeader(headers, "From"),
    to: extractHeader(headers, "To"),
    subject: extractHeader(headers, "Subject"),
    date: extractHeader(headers, "Date"),
    snippet: emailPayload.snippet,
    labels: emailPayload.labelIds,
  };

  emailLogger.info("Received new email", {
    userId: gmailConnection.userId,
    from: emailInfo.from,
    subject: emailInfo.subject,
  });

  const isImportant = evaluateEmailImportance(emailInfo);

  if (!isImportant) {
    emailLogger.info("Email not important", {
      from: emailInfo.from,
      subject: emailInfo.subject,
    });
    return { success: true, message: "Email not important" };
  }

  return notifyUserAboutEmail(gmailConnection.userId, emailInfo, db, env);
};

const extractHeader = (
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | undefined => {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
};

type EmailInfo = {
  messageId: string;
  threadId: string;
  from: string | undefined;
  to: string | undefined;
  subject: string | undefined;
  date: string | undefined;
  snippet: string;
  labels: string[];
};

const evaluateEmailImportance = (emailInfo: EmailInfo): boolean => {
  const hasImportantLabel = emailInfo.labels.includes("IMPORTANT");
  const hasStarredLabel = emailInfo.labels.includes("STARRED");
  const isCategoryPrimary = emailInfo.labels.includes("CATEGORY_PERSONAL");

  const urgentKeywords = [
    "urgent",
    "asap",
    "immediately",
    "time sensitive",
    "action required",
    "deadline",
    "emergency",
  ];

  const subjectLower = (emailInfo.subject || "").toLowerCase();
  const snippetLower = emailInfo.snippet.toLowerCase();

  const hasUrgentKeyword = urgentKeywords.some(
    (keyword) =>
      subjectLower.includes(keyword) || snippetLower.includes(keyword),
  );

  return (
    hasImportantLabel ||
    hasStarredLabel ||
    (isCategoryPrimary && hasUrgentKeyword)
  );
};

const notifyUserAboutEmail = async (
  userId: string,
  emailInfo: EmailInfo,
  db: Database,
  env: WorkerEnv,
): Promise<{ success: boolean; message: string }> => {
  const notifyLogger = logger.withTags({ module: "email-notify" });

  const userConversation = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(
      conversations,
      eq(conversations.id, conversationParticipants.conversationId),
    )
    .where(eq(conversationParticipants.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  if (userConversation.length === 0) {
    notifyLogger.warn("No conversation found", { userId });
    return { success: false, message: "No conversation found" };
  }

  const conversationId = userConversation[0].conversationId;

  const interactionAgent = await db.query.agents.findFirst({
    where: eq(agents.conversationId, conversationId),
  });

  if (!interactionAgent) {
    notifyLogger.warn("No interaction agent found", { conversationId });
    return { success: false, message: "No interaction agent found" };
  }

  const taskDescription = `[EMAIL NOTIFICATION] New important email received:
From: ${emailInfo.from || "Unknown"}
Subject: ${emailInfo.subject || "(no subject)"}
Preview: ${emailInfo.snippet}

Notify the user about this email. Keep it brief but informative.`;

  const executionAgentId = env.EXECUTION_AGENT.idFromName(interactionAgent.id);
  const executionAgent = env.EXECUTION_AGENT.get(executionAgentId);

  try {
    await executionAgent.executeTask({
      agentId: interactionAgent.id,
      conversationId,
      taskDescription,
      userId,
    });

    notifyLogger.info("Email notification dispatched", {
      userId,
      from: emailInfo.from,
      subject: emailInfo.subject,
    });

    return { success: true, message: "User notified" };
  } catch (error) {
    notifyLogger.error("Failed to dispatch email notification", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return { success: false, message: "Failed to notify user" };
  }
};
