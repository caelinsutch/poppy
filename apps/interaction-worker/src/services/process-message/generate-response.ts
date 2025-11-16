import { stepCountIs, ToolLoopAgent } from "ai";
import { logger } from "@poppy/hono-helpers";
import { gemini25 } from "../../clients/ai/openrouter";
import { basePrompt } from "../../prompts/base";
import {
  createSendMessageToAgentTool,
  sendMessageToUser,
  wait,
} from "../../tools";
import { webSearch } from "../../tools/web-search";
import type { ProcessMessageOptions } from "./types";

export const generateResponse = async (
  formattedConversation: string,
  options: ProcessMessageOptions & {
    interactionAgentId: string;
  },
) => {
  const { conversation, participants, interactionAgentId, db } = options;

  logger
    .withTags({
      conversationId: conversation.id,
      interactionAgentId,
    })
    .info("Starting response generation", {
      isGroup: conversation.isGroup,
      participantCount: participants.length,
      conversationLength: formattedConversation.length,
    });

  const system = `
${basePrompt}

${conversation.isGroup ? "You are in a group conversation." : "You are in a 1-on-1 conversation with the user."}

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

### Wait Tool Usage

- \`wait(reason)\` should be used when you detect that a message or response is already present in the conversation history and you want to avoid duplicating it.
- This adds a silent log entry that prevents redundant messages to the user.
- Use this when you see that the same draft, confirmation, or response has already been sent.
- Always provide a clear reason explaining what you're avoiding duplicating.

## Interaction Modes

- When the input contains \`<new_user_message>\`, decide if you can answer outright. If you need help, first acknowledge the user and explain the next step with \`send_message_to_user\`, then call \`send_message_to_agent\` with clear instructions. Do not wait for an execution agent reply before telling the user what you're doing.
- When the input contains \`<new_agent_message>\`, treat each \`<agent_message>\` block as an execution agent result. Summarize the outcome for the user using \`send_message_to_user\`. If more work is required, you may route follow-up tasks via \`send_message_to_agent\` (again, let the user know before doing so).
- The XML-like tags are just structure—do not echo them back to the user.

## Message Structure

Your input follows this structure:
- \`<conversation_history>\`: Previous exchanges (if any)
- \`<new_user_message>\` or \`<new_agent_message>\`: The current message to respond to

Message types within the conversation:
- \`<user_message>\`: Sent by the actual human user - the most important and ONLY source of user input
- \`<agent_message>\`: Sent by execution agents when they report task results back to you
- \`<poke_reply>\`: Your previous responses to the user

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
${participants.map((p) => `- ${p.id}: ${p.phoneNumber}`).join("\n")}
`;

  logger
    .withTags({
      conversationId: conversation.id,
      interactionAgentId,
    })
    .info("Creating ToolLoopAgent with tools", {
      tools: [
        "send_message_to_agent",
        "send_message_to_user",
        "wait",
        "webSearch",
      ],
      maxSteps: 10,
    });

  const agent = new ToolLoopAgent({
    model: gemini25,
    instructions: system,
    tools: {
      send_message_to_agent: createSendMessageToAgentTool(
        db,
        interactionAgentId,
        conversation.id,
      ),
      send_message_to_user: sendMessageToUser,
      wait,
      webSearch,
    },
    stopWhen: stepCountIs(10),
  });

  logger
    .withTags({
      conversationId: conversation.id,
      interactionAgentId,
    })
    .info("Calling agent.generate with formatted conversation");

  const result = await agent.generate({
    messages: [
      {
        role: "user",
        content: formattedConversation,
      },
    ],
  });

  logger
    .withTags({
      conversationId: conversation.id,
      interactionAgentId,
    })
    .info("Agent generation completed", {
      toolResultCount: result.toolResults?.length || 0,
      usage: result.usage,
    });

  // Extract messages to user from tool results
  const messagesToUser: string[] = [];

  logger
    .withTags({
      conversationId: conversation.id,
      interactionAgentId,
    })
    .info("Extracting messages to user from tool results", {
      toolResultCount: result.toolResults?.length || 0,
    });

  // Check if there are tool results in the result
  if (result.toolResults && result.toolResults.length > 0) {
    for (const toolResult of result.toolResults) {
      logger
        .withTags({
          conversationId: conversation.id,
          interactionAgentId,
        })
        .info("Processing tool result", {
          toolName: toolResult.toolName,
          hasOutput: !!toolResult.output,
        });

      if (toolResult.toolName === "send_message_to_user") {
        const output = toolResult.output as {
          type: "send_to_user";
          content: string;
        };
        if (output?.type === "send_to_user" && output.content) {
          messagesToUser.push(output.content);
          logger
            .withTags({
              conversationId: conversation.id,
              interactionAgentId,
            })
            .info("Found send_message_to_user result", {
              contentLength: output.content.length,
              content: output.content.substring(0, 100),
            });
        }
      }
    }
  }

  logger
    .withTags({
      conversationId: conversation.id,
      interactionAgentId,
    })
    .info("Completed response generation", {
      messagesToUserCount: messagesToUser.length,
      hasUserMessages: messagesToUser.length > 0,
      usage: result.usage,
    });

  return {
    usage: result.usage,
    messagesToUser,
    hasUserMessages: messagesToUser.length > 0,
  };
};
