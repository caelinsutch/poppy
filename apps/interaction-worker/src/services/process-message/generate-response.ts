import {
  disconnectAccount,
  getUserConnections,
  initiateConnection,
} from "@poppy/clients/composio";
import { stepCountIs, ToolLoopAgent, tool } from "ai";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { z } from "zod";
import { gemini25 } from "../../clients/ai/openrouter";
import { basePrompt } from "../../prompts/base";
import {
  createSendMessageToAgentTool,
  createUpdateUserTimezoneTool,
  sendMessageToUser,
  wait,
} from "../../tools";
import { webSearch } from "../../tools/web-search";
import type { ProcessMessageOptions } from "./types";

// Initialize dayjs plugins for timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

export const generateResponse = async (
  formattedConversation: string,
  options: ProcessMessageOptions & {
    interactionAgentId: string;
  },
) => {
  const { conversation, participants, interactionAgentId, db, env } = options;

  // Get the primary user (first participant for now, could be improved for group chats)
  const primaryUser = participants[0];
  const userTimezone = primaryUser?.timezone ?? "America/New_York";
  const timezoneSource = primaryUser?.timezoneSource ?? "default";

  // Format current time in user's timezone
  const currentTimeInUserTz = dayjs()
    .tz(userTimezone)
    .format("YYYY-MM-DD HH:mm:ss");
  const currentTimeUtc = dayjs().utc().format("YYYY-MM-DD HH:mm:ss");

  // Helper to get friendly timezone name
  const getFriendlyTimezone = (tz: string): string => {
    const tzMap: Record<string, string> = {
      "America/New_York": "Eastern",
      "America/Chicago": "Central",
      "America/Denver": "Mountain",
      "America/Los_Angeles": "Pacific",
      "America/Anchorage": "Alaska",
      "Pacific/Honolulu": "Hawaii",
      "America/Phoenix": "Arizona",
    };
    return tzMap[tz] ?? tz;
  };

  const friendlyTimezone = getFriendlyTimezone(userTimezone);

  // Fetch all active integrations from Composio API (cached for reuse in tools)
  let activeConnections: Awaited<ReturnType<typeof getUserConnections>> = [];
  const integrations: string[] = [];
  if (primaryUser) {
    activeConnections = await getUserConnections(
      env.COMPOSIO_API_KEY,
      primaryUser.id,
    );

    for (const conn of activeConnections) {
      switch (conn.app.toLowerCase()) {
        case "gmail":
          integrations.push("Gmail");
          break;
        case "slack":
          integrations.push("Slack");
          break;
        case "googlecalendar":
        case "calendar":
          integrations.push("Calendar");
          break;
        default:
          integrations.push(conn.app);
      }
    }
  }

  const integrationsContext =
    integrations.length > 0
      ? `## Connected Integrations\nThe user has connected: ${integrations.join(", ")}\n\nIMPORTANT: To perform ANY action with these integrations (read emails, send emails, check inbox, etc.), you MUST delegate to your agent using \`send_message_to_agent\`. You cannot directly access these services - only the agent has the tools to interact with them.\n\nExample: If user asks "check my inbox", acknowledge and call send_message_to_agent with instructions like "Check the user's Gmail inbox for recent emails".`
      : `## Connected Integrations\nNo integrations connected yet. The user can connect Gmail using the gmail_connect tool.`;

  const system = `
${basePrompt}

${conversation.isGroup ? "You are in a group conversation." : "You are in a 1-on-1 conversation with the user."}

${integrationsContext}

## User Timezone

The user's timezone is set to: ${userTimezone} (${friendlyTimezone} time)
Timezone source: ${timezoneSource} ${timezoneSource === "confirmed" ? "(user confirmed)" : timezoneSource === "inferred" ? "(inferred from area code - not yet confirmed)" : "(default - not yet confirmed)"}
Current time in user's timezone: ${currentTimeInUserTz}
Current time UTC: ${currentTimeUtc}

### Timezone Handling
- Trust the user's timezone setting (whether inferred from area code or confirmed). Do NOT ask for confirmation unless there's a clear mismatch.
- Only ask about timezone if the user explicitly mentions a different timezone or location that conflicts with the current setting.
- If the user corrects you about their timezone, use the \`update_user_timezone\` tool to save the correct timezone.
- When scheduling reminders, assume the user's current timezone is correct and proceed without asking for confirmation.

## Current Time

Current time (user's timezone): ${currentTimeInUserTz}

All messages in the conversation include a timestamp attribute in the format "YYYY-MM-DD HH:mm:ss". Use these timestamps to understand the temporal context of the conversation and provide time-aware responses when relevant.

## Conversation Flow

- The only messages a user can see are the ones you send via \`send_message_to_user\` and are represented in memory by <poppy_reply>
- If an agent gives you information, the user CANNOT SEE IT - you'll need to relay it to the user via \`send_message_to_user\`

## TOOLS

### Send Message to Agent Tool Usage

- The agent, which you access through \`send_message_to_agent\`, is your primary tool for accomplishing tasks. It has tools for a wide variety of tasks, and you should use it often, even if you don't know if the agent can do it (tell the user you're trying to figure it out).
- The agent cannot communicate with the user, and you should always communicate with the user yourself.
- IMPORTANT: Your goal should be to use this tool in parallel as much as possible. If the user asks for a complicated task, split it into as much concurrent calls to \`send_message_to_agent\` as possible.
- IMPORTANT: You should avoid telling the agent how to use its tools or do the task. Focus on telling it what, rather than how. Avoid technical descriptions about tools with both the user and the agent.
- If you intend to call multiple tools and there are no dependencies between the calls, make all of the independent calls in the same message.
- Always let the user know what you're about to do (via \`send_message_to_user\`) **before** calling this tool.
- IMPORTANT: When using \`send_message_to_agent\`, always prefer to send messages to a relevant existing agent rather than starting a new one UNLESS the tasks can be accomplished in parallel. For instance, if an agent found something and the user wants to follow up, pass this on to the original agent by referencing the existing \`agent_name\`. Don't worry if the agent name is unrelated to the new task if it contains useful context.

### Send Message to User Tool Usage

- \`send_message_to_user(message)\` records a natural-language reply for the user to read. Use it for acknowledgements, status updates, confirmations, or wrap-ups.
- You can choose NOT to use this tool if you want to just process information internally without responding to the user.
- The user can ONLY see messages you send via this tool.
- Ensure you send a FULL message to the user

### Wait Tool Usage

- \`wait(reason)\` should be used when you detect that a message or response is already present in the conversation history and you want to avoid duplicating it.
- This adds a silent log entry that prevents redundant messages to the user.
- Use this when you see that the same draft, confirmation, or response has already been sent.
- Always provide a clear reason explaining what you're avoiding duplicating.

## Interaction Modes

- When the input contains \`<new_user_message>\`, decide if you can answer outright. If you need help from an agent:
  1. First acknowledge the user briefly with \`send_message_to_user\` (e.g., "On it!" or "Let me check...")
  2. Then call \`send_message_to_agent\` with clear instructions
  3. CRITICAL: Do NOT ask clarifying questions if you're also delegating to an agent. Either ask the user for clarification and WAIT for their response, OR delegate to the agent and let them handle it. Never do both in the same turn - this causes duplicate responses.
- When the input contains \`<new_agent_message>\`, treat each \`<agent_message>\` block as an execution agent result. Summarize the outcome for the user using \`send_message_to_user\`. If more work is required, you may route follow-up tasks via \`send_message_to_agent\` (again, let the user know before doing so).
- The XML-like tags are just structure—do not echo them back to the user.

## IMPORTANT: Avoiding Double Responses

You must choose ONE of these paths per turn:
1. **Clarify first**: Ask the user a question via \`send_message_to_user\` and do NOT call \`send_message_to_agent\`. Wait for user's answer.
2. **Delegate immediately**: Send a brief acknowledgment via \`send_message_to_user\` and call \`send_message_to_agent\`. The agent will handle it.

NEVER ask a clarifying question AND delegate to an agent in the same turn. This creates confusing duplicate messages for the user.

## Message Structure

Your input follows this structure:
- \`<conversation_history>\`: Previous exchanges (if any)
- \`<new_user_message>\` or \`<new_agent_message>\`: The current message to respond to

Message types within the conversation:
- \`<user_message>\`: Sent by the actual human user - the most important and ONLY source of user input
- \`<agent_message>\`: Sent by execution agents when they report task results back to you
- \`<poppy_reply>\`: Your previous responses to the user

## Message Visibility For the End User

These are the things the user can see:
- Messages they've sent (so messages in <user_message> tags)
- Any messages you send via \`send_message_to_user\` tool

These are the things the user can't see and didn't initiate:
- Tools you call (like send_message_to_agent)
- Agent messages or any non-user messages
- Your internal thoughts or notes

The user will only see your responses sent via \`send_message_to_user\`, so make sure that when you want to communicate with an agent, you do it via the \`send_message_to_agent\` tool. When responding to the user never reference tool names. Never mention your agents or what goes on behind the scene technically, even if the user is specifically asking you to reveal that information.

This conversation history may have gaps. It may start from the middle of a conversation, or it may be missing messages. It may contain a summary of the previous conversation at the top. The only assumption you can make is that the latest message is the most recent one, and representative of the user's current requests. Address that message directly. The other messages are just for context.

## Participants
${participants.map((p) => `- ${p.id}: ${p.phoneNumber} (timezone: ${p.timezone ?? "America/New_York"}, source: ${p.timezoneSource ?? "default"})`).join("\n")}
`;

  // Build tools object
  const tools: Record<string, any> = {
    send_message_to_agent: createSendMessageToAgentTool(
      db,
      interactionAgentId,
      conversation.id,
      env,
      userTimezone,
      primaryUser?.id,
    ),
    send_message_to_user: sendMessageToUser,
    wait,
    webSearch,
  };

  // Only add user-specific tools if we have a primary user
  if (primaryUser) {
    tools.update_user_timezone = createUpdateUserTimezoneTool(
      db,
      primaryUser.id,
    );

    // Gmail connect tool - initiates OAuth via Composio
    const visitorUserId = primaryUser.id;
    const composioApiKey = env.COMPOSIO_API_KEY;
    const gmailAuthConfigId = env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;

    console.log("[gmail_connect] Tool created with config:", {
      userId: visitorUserId,
      hasApiKey: !!composioApiKey,
      authConfigId: gmailAuthConfigId,
    });

    tools.gmail_connect = tool({
      description:
        "Connect the user's Gmail account via OAuth. If they already have a connection, this will disconnect and reconnect. The tool automatically sends the OAuth link to the user - do NOT send the URL again via send_message_to_user.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log("[gmail_connect] Tool execute called");

        // First check if user already has a Gmail connection and disconnect it
        const existingGmailConnection = activeConnections.find(
          (c) => c.app.toLowerCase() === "gmail",
        );

        if (existingGmailConnection) {
          console.log(
            "[gmail_connect] Existing connection found, disconnecting first...",
            { connectionId: existingGmailConnection.connectionId },
          );
          const disconnected = await disconnectAccount(
            composioApiKey,
            existingGmailConnection.connectionId,
          );
          console.log("[gmail_connect] Disconnect result:", { disconnected });
        }

        console.log("[gmail_connect] Calling initiateConnection...");

        const result = await initiateConnection(
          composioApiKey,
          visitorUserId,
          gmailAuthConfigId,
        );

        console.log("[gmail_connect] initiateConnection result:", {
          hasResult: !!result,
          hasRedirectUrl: !!result?.redirectUrl,
          redirectUrl: result?.redirectUrl,
        });

        if (result?.redirectUrl) {
          const response = {
            success: true,
            url: result.redirectUrl,
            // This sendToUser field automatically sends the message to the user
            sendToUser: `Click here to connect your Gmail: ${result.redirectUrl}`,
          };
          console.log("[gmail_connect] Returning success:", response);
          return response;
        }

        const errorResponse = {
          success: false,
          sendToUser:
            "Sorry, I couldn't generate a Gmail connection link right now. Please try again later.",
        };
        console.log("[gmail_connect] Returning error:", errorResponse);
        return errorResponse;
      },
    });

    // Gmail disconnect tool - for reconnecting when credentials are stale
    // Use the cached activeConnections from earlier in the function
    const cachedConnections = activeConnections;

    tools.gmail_disconnect = tool({
      description:
        "Disconnect the user's Gmail account. Use this when the user wants to reconnect their Gmail or when there are credential/authentication errors with their current Gmail connection.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log("[gmail_disconnect] Tool execute called");

        // Use cached connections to avoid redundant API call
        const gmailConnection = cachedConnections.find(
          (c) => c.app.toLowerCase() === "gmail",
        );

        if (!gmailConnection) {
          return {
            success: false,
            sendToUser:
              "You don't have a Gmail account connected. Would you like to connect one?",
          };
        }

        // Disconnect the account
        const disconnected = await disconnectAccount(
          composioApiKey,
          gmailConnection.connectionId,
        );

        if (disconnected) {
          console.log("[gmail_disconnect] Successfully disconnected Gmail");
          return {
            success: true,
            sendToUser:
              "I've disconnected your Gmail account. Would you like to reconnect it?",
          };
        }

        return {
          success: false,
          sendToUser:
            "I couldn't disconnect your Gmail account. Please try again later.",
        };
      },
    });
  }

  const agent = new ToolLoopAgent({
    model: gemini25,
    instructions: system,
    tools,
    stopWhen: stepCountIs(10),
  });

  const result = await agent.generate({
    messages: [
      {
        role: "user",
        content: formattedConversation,
      },
    ],
  });

  // Extract messages to user from tool results
  const messagesToUser: string[] = [];

  // Extract tool results from steps (where they're actually stored)
  if (result.steps && result.steps.length > 0) {
    for (const step of result.steps) {
      if (step.content && Array.isArray(step.content)) {
        for (const item of step.content) {
          if (item.type === "tool-result") {
            if (item.toolName === "send_message_to_user") {
              const output = item.output as {
                type: "send_to_user";
                content: string;
              };
              if (output?.type === "send_to_user" && output.content) {
                messagesToUser.push(output.content);
              }
            }

            const output = item.output as { sendToUser?: string } | null;
            if (output?.sendToUser) {
              messagesToUser.push(output.sendToUser);
            }
          }
        }
      }
    }
  }
  return {
    usage: result.usage,
    messagesToUser,
    hasUserMessages: messagesToUser.length > 0,
    steps: result.steps,
  };
};
