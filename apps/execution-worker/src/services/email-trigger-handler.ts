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

export type EmailTriggerPayload = {
  event: string;
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

const extractEmailHeader = (
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | undefined => {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
};

export const handleEmailTrigger = async (
  payload: EmailTriggerPayload,
  env: WorkerEnv,
): Promise<{ success: boolean; message: string }> => {
  const emailLogger = logger.withTags({ module: "email-trigger" });

  emailLogger.info("Processing email trigger", {
    event: payload.event,
    triggerName: payload.data?.triggerName,
    entityId: payload.data?.entityId,
  });

  if (
    payload.event !== "trigger" ||
    payload.data?.triggerName !== "GMAIL_NEW_GMAIL_MESSAGE"
  ) {
    emailLogger.info("Ignoring non-email trigger event", {
      event: payload.event,
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
    emailLogger.warn("No Gmail connection found for Composio user", {
      composioUserId,
    });
    return { success: false, message: "Gmail connection not found" };
  }

  const emailPayload = payload.data.payload;
  const headers = emailPayload.payload.headers;

  const emailInfo = {
    messageId: emailPayload.messageId,
    threadId: emailPayload.threadId,
    from: extractEmailHeader(headers, "From"),
    to: extractEmailHeader(headers, "To"),
    subject: extractEmailHeader(headers, "Subject"),
    date: extractEmailHeader(headers, "Date"),
    snippet: emailPayload.snippet,
    labels: emailPayload.labelIds,
  };

  emailLogger.info("Received new email", {
    userId: gmailConnection.userId,
    from: emailInfo.from,
    subject: emailInfo.subject,
  });

  const isImportant = await evaluateEmailImportance(emailInfo, env);

  if (!isImportant) {
    emailLogger.info("Email not important enough to notify", {
      from: emailInfo.from,
      subject: emailInfo.subject,
    });
    return { success: true, message: "Email not important" };
  }

  const result = await notifyUserAboutEmail(
    gmailConnection.userId,
    emailInfo,
    db,
    env,
  );

  return result;
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

const evaluateEmailImportance = async (
  emailInfo: EmailInfo,
  _env: WorkerEnv,
): Promise<boolean> => {
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

  const isImportant =
    hasImportantLabel ||
    hasStarredLabel ||
    (isCategoryPrimary && hasUrgentKeyword);

  logger.info("Email importance evaluation", {
    from: emailInfo.from,
    subject: emailInfo.subject,
    hasImportantLabel,
    hasStarredLabel,
    isCategoryPrimary,
    hasUrgentKeyword,
    isImportant,
  });

  return isImportant;
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
    notifyLogger.warn("No conversation found for user", { userId });
    return { success: false, message: "No conversation found" };
  }

  const conversationId = userConversation[0].conversationId;

  const interactionAgent = await db.query.agents.findFirst({
    where: eq(agents.conversationId, conversationId),
  });

  if (!interactionAgent) {
    notifyLogger.warn("No interaction agent found for conversation", {
      conversationId,
    });
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

    notifyLogger.info("Email notification task dispatched", {
      userId,
      from: emailInfo.from,
      subject: emailInfo.subject,
    });

    return { success: true, message: "User notified" };
  } catch (error) {
    notifyLogger.error("Failed to dispatch email notification task", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return { success: false, message: "Failed to notify user" };
  }
};
