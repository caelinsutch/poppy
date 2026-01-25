import {
  agents,
  conversationParticipants,
  conversations,
  getDb,
} from "@poppy/db";
import { logger } from "@poppy/hono-helpers";
import { desc, eq } from "drizzle-orm";
import type { WorkerEnv } from "../context";

type Database = ReturnType<typeof getDb>;

// Composio V2 webhook format for email triggers
type ComposioV2EmailPayload = {
  type: "gmail_new_gmail_message";
  timestamp: string;
  log_id: string;
  data: {
    id: string;
    message_id: string;
    thread_id: string;
    label_ids: string[];
    message_text: string;
    message_timestamp: string;
    sender: string;
    subject: string;
    to: string;
    preview?: {
      body: string;
      subject: string;
    };
    connection_id: string;
    connection_nano_id: string;
    trigger_nano_id: string;
    trigger_id: string;
    user_id: string; // This is our Poppy userId
  };
};

// Legacy email trigger format
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
    entityId: string; // This is our Poppy userId
  };
};

// OAuth completion webhook (if Composio sends one)
type OAuthCallbackPayload = {
  connectionId: string;
  status: "ACTIVE" | "FAILED";
  email?: string;
  userId?: string; // This is our Poppy userId
};

type ComposioWebhookPayload =
  | OAuthCallbackPayload
  | EmailTriggerPayload
  | ComposioV2EmailPayload;

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

const isEmailTrigger = (
  payload: ComposioWebhookPayload,
): payload is EmailTriggerPayload => {
  return "event" in payload && payload.event === "trigger";
};

const isV2EmailPayload = (
  payload: ComposioWebhookPayload,
): payload is ComposioV2EmailPayload => {
  return "type" in payload && payload.type === "gmail_new_gmail_message";
};

const isOAuthCallback = (
  payload: ComposioWebhookPayload,
): payload is OAuthCallbackPayload => {
  return "connectionId" in payload && "status" in payload;
};

export const handleComposioWebhook = async (
  payload: ComposioWebhookPayload,
  env: WorkerEnv,
): Promise<{ success: boolean; message: string }> => {
  const webhookLogger = logger.withTags({ module: "composio-webhook" });

  webhookLogger.info("Processing Composio webhook", { payload });

  if (isV2EmailPayload(payload)) {
    return handleV2EmailTrigger(payload, env);
  }

  if (isEmailTrigger(payload)) {
    return handleEmailTrigger(payload, env);
  }

  if (isOAuthCallback(payload)) {
    return handleOAuthCallback(payload, env);
  }

  webhookLogger.warn("Unknown webhook payload type", { payload });
  return { success: false, message: "Unknown payload type" };
};

const handleOAuthCallback = async (
  payload: OAuthCallbackPayload,
  env: WorkerEnv,
): Promise<{ success: boolean; message: string }> => {
  const webhookLogger = logger.withTags({ module: "composio-oauth" });

  webhookLogger.info("Processing OAuth callback", {
    connectionId: payload.connectionId,
    status: payload.status,
    userId: payload.userId,
  });

  // With Composio managing connections, we just need to notify the user
  // The userId in the payload IS our Poppy userId
  if (payload.status === "ACTIVE" && payload.userId) {
    const db = getDb(env.HYPERDRIVE.connectionString);
    await sendWelcomeMessage(payload.userId, db, env);
    return { success: true, message: "Connection activated, user notified" };
  }

  if (payload.status === "FAILED") {
    webhookLogger.warn("OAuth connection failed", {
      connectionId: payload.connectionId,
      userId: payload.userId,
    });
  }

  return { success: true, message: "OAuth callback processed" };
};

const handleV2EmailTrigger = async (
  payload: ComposioV2EmailPayload,
  env: WorkerEnv,
): Promise<{ success: boolean; message: string }> => {
  const emailLogger = logger.withTags({ module: "v2-email-trigger" });

  emailLogger.info("Processing V2 email trigger", {
    type: payload.type,
    userId: payload.data.user_id,
    subject: payload.data.subject,
  });

  // The user_id from Composio IS our Poppy userId
  const userId = payload.data.user_id;

  const emailInfo: EmailInfo = {
    messageId: payload.data.message_id,
    threadId: payload.data.thread_id,
    from: payload.data.sender,
    to: payload.data.to,
    subject: payload.data.subject,
    date: payload.data.message_timestamp,
    snippet:
      payload.data.preview?.body || payload.data.message_text.slice(0, 200),
    labels: payload.data.label_ids,
  };

  emailLogger.info("Received new email via V2", {
    userId,
    from: emailInfo.from,
    subject: emailInfo.subject,
  });

  const isImportant = evaluateEmailImportance(emailInfo);

  if (!isImportant) {
    emailLogger.info("Email not important, skipping notification", {
      from: emailInfo.from,
      subject: emailInfo.subject,
    });
    return { success: true, message: "Email not important" };
  }

  const db = getDb(env.HYPERDRIVE.connectionString);
  return notifyUserAboutEmail(userId, emailInfo, db, env);
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

  // The entityId from Composio IS our Poppy userId
  const userId = payload.data.entityId;

  const emailPayload = payload.data.payload;
  const headers = emailPayload.payload.headers;

  const emailInfo: EmailInfo = {
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
    userId,
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

  const db = getDb(env.HYPERDRIVE.connectionString);
  return notifyUserAboutEmail(userId, emailInfo, db, env);
};

const sendWelcomeMessage = async (
  userId: string,
  db: Database,
  env: WorkerEnv,
): Promise<void> => {
  const notifyLogger = logger.withTags({ module: "gmail-welcome" });

  // Find user's conversation
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

  const taskDescription = `[GMAIL CONNECTED] The user just successfully connected their Gmail account. Acknowledge this and offer to help with their inbox.`;

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

const extractHeader = (
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | undefined => {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
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

  // Find user's conversation
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
